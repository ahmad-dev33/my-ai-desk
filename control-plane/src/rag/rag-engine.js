import { createHash } from 'node:crypto';

/**
 * Isolated AI & RAG Engine Module
 * 
 * Provides content chunking, vector embedding calculation, pgvector similarity search,
 * prompt context synthesis, and automated human handoff policy evaluation.
 */

/**
 * Splits document content into uniform semantic chunks with overlap.
 * @param {string} text - Raw document content.
 * @param {Object} [options]
 * @param {number} [options.chunkSize=600] - Max characters per chunk.
 * @param {number} [options.overlap=100] - Character overlap between chunks.
 * @returns {Array<{ ordinal: number, content: string, tokenCount: number }>}
 */
export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || 600;
  const overlap = options.overlap || 100;
  const cleanedText = (text || '').trim();

  if (!cleanedText) return [];

  const chunks = [];
  let start = 0;
  let ordinal = 0;

  while (start < cleanedText.length) {
    let end = start + chunkSize;
    if (end < cleanedText.length) {
      // Attempt to split on newline or space boundary if possible
      const boundary = cleanedText.lastIndexOf(' ', end);
      if (boundary > start + chunkSize / 2) {
        end = boundary;
      }
    }

    const chunkContent = cleanedText.slice(start, end).trim();
    if (chunkContent.length > 0) {
      // Rough estimation: 1 token ≈ 4 characters
      const tokenCount = Math.ceil(chunkContent.length / 4);
      chunks.push({
        ordinal,
        content: chunkContent,
        tokenCount,
      });
      ordinal++;
    }

    if (end >= cleanedText.length) break;
    start = end - overlap;
  }

  return chunks;
}

/**
 * Generates a normalized float vector embedding array for text.
 * Uses OPENAI_API_KEY if present, or a deterministic vector generator for local/offline environments.
 * @param {string} text
 * @param {number} [dimensions=1536]
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text, dimensions = 1536) {
  const normalized = (text || '').trim().toLowerCase();
  
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'mock') {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: normalized,
          model: 'text-embedding-3-small',
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.data?.[0]?.embedding) {
          return json.data[0].embedding;
        }
      }
      throw new Error(`Embedding provider returned ${response.status}`);
    } catch (err) {
      if (process.env.NODE_ENV === 'production') throw err;
      console.warn('[RAG Engine] OpenAI embedding call failed, using fallback embedding:', err.message);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('OPENAI_API_KEY is required for production knowledge indexing');
  }

  // Deterministic local vector embedding fallback for offline/test environments
  const vector = new Array(dimensions).fill(0);
  const hash = createHash('sha256').update(normalized).digest();
  
  for (let i = 0; i < dimensions; i++) {
    const byte = hash[i % hash.length];
    const charCode = normalized.charCodeAt(i % Math.max(1, normalized.length)) || 0;
    const rawVal = Math.sin((byte + charCode + i) * 0.1);
    vector[i] = rawVal;
  }

  // Normalize vector to unit length L2 norm
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map((val) => Number((val / norm).toFixed(6)));
}

/**
 * Evaluates whether an incoming message triggers human handoff based on tenant policy and keywords.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} messageText
 * @returns {Promise<{ shouldHandoff: boolean, reason?: string, fallbackReply?: string, escalationInboxId?: number }>}
 */
export async function evaluateHandoff(db, tenantId, messageText) {
  const text = (messageText || '').trim().toLowerCase();
  if (!text) return { shouldHandoff: false };

  // Fetch tenant handoff policy
  const policyRes = await db.query(
    'SELECT * FROM ai_handoff_policies WHERE tenant_id = $1',
    [tenantId],
  );

  const policy = policyRes.rows[0] || {
    auto_handoff_keywords: ['human', 'agent', 'support', 'help', 'representative', 'person', 'انسان', 'موظف', 'دعم', 'مساعدة'],
    fallback_reply: 'I am connecting you with a human representative who can assist you further.',
  };

  const keywords = policy.auto_handoff_keywords || [];
  for (const kw of keywords) {
    if (kw && text.includes(kw.toLowerCase())) {
      return {
        shouldHandoff: true,
        reason: `Matched human handoff keyword: "${kw}"`,
        fallbackReply: policy.fallback_reply,
        escalationInboxId: policy.escalation_inbox_id,
      };
    }
  }

  return { shouldHandoff: false };
}

/**
 * Performs vector similarity search across chunked tenant knowledge documents.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} queryText
 * @param {number} [topK=3]
 * @returns {Promise<Array<{ chunkId: string, documentId: string, content: string, similarity: number }>>}
 */
export async function searchKnowledge(db, tenantId, queryText, topK = 3) {
  const queryEmbedding = await generateEmbedding(queryText);
  const vectorString = `[${queryEmbedding.join(',')}]`;

  try {
    // Try pgvector cosine distance query first
    const result = await db.query(
      `SELECT c.id AS chunk_id, c.document_id, c.content, c.ordinal,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE c.tenant_id = $2 AND d.status = 'ready' AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [vectorString, tenantId, topK],
    );

    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content,
      similarity: Number(row.similarity || 0),
    }));
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    // Fallback if vector extension/syntax is not active in the current session
    const fallbackRes = await db.query(
      `SELECT c.id AS chunk_id, c.document_id, c.content, c.ordinal
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       WHERE c.tenant_id = $1 AND d.status = 'ready'
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [tenantId, topK],
    );

    return fallbackRes.rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      content: row.content,
      similarity: 0.8, // Default simulated score for fallback text match
    }));
  }
}

/**
 * Ingests and chunks a knowledge document into the knowledge_chunks table.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} documentId
 * @returns {Promise<{ chunkCount: number }>}
 */
export async function processDocumentChunks(db, tenantId, documentId) {
  const docRes = await db.query(
    'SELECT * FROM knowledge_documents WHERE id = $1 AND tenant_id = $2',
    [documentId, tenantId],
  );

  if (!docRes.rowCount) throw new Error('Document not found');
  const doc = docRes.rows[0];

  await db.query(
    `UPDATE knowledge_documents SET status = 'processing', updated_at = now() WHERE id = $1`,
    [documentId],
  );

  try {
    if (!doc.content?.trim()) {
      throw new Error(`Knowledge source ${doc.source_kind} has no extracted content to index`);
    }
    const chunks = chunkText(doc.content);

    await db.transaction(async (client) => {
      // Clear old chunks if re-processing
      await client.query('DELETE FROM knowledge_chunks WHERE document_id = $1', [documentId]);

      for (const chunk of chunks) {
        const embedding = await generateEmbedding(chunk.content);
        const vectorString = `[${embedding.join(',')}]`;

        try {
          await client.query(
            `INSERT INTO knowledge_chunks (tenant_id, document_id, ordinal, content, token_count, embedding)
             VALUES ($1, $2, $3, $4, $5, $6::vector)`,
            [tenantId, documentId, chunk.ordinal, chunk.content, chunk.tokenCount, vectorString],
          );
        } catch {
          // Fallback if vector type is not supported in non-pgvector mock test DBs
          await client.query(
            `INSERT INTO knowledge_chunks (tenant_id, document_id, ordinal, content, token_count)
             VALUES ($1, $2, $3, $4, $5)`,
            [tenantId, documentId, chunk.ordinal, chunk.content, chunk.tokenCount],
          );
        }
      }

      await client.query(
        `UPDATE knowledge_documents SET status = 'ready', updated_at = now() WHERE id = $1`,
        [documentId],
      );
    });

    return { chunkCount: chunks.length };
  } catch (err) {
    await db.query(
      `UPDATE knowledge_documents SET status = 'error', error_message = $1, updated_at = now() WHERE id = $2`,
      [err.message, documentId],
    );
    throw err;
  }
}
