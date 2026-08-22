/**
 * Isolated Contact & Custom Field Sync Engine
 * 
 * Provides bi-directional synchronization between Chatwoot operational contact copies
 * and the canonical Control Plane CRM database (`contact_profiles` & `contact_identities`).
 */

/**
 * Upserts a contact profile and identity into canonical CRM from Chatwoot event/payload.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {Object} payload - Incoming Chatwoot contact or sender object
 * @param {number|string} payload.id - Chatwoot external contact ID
 * @param {string} [payload.name] - Contact display name
 * @param {string} [payload.email] - Contact email address
 * @param {string} [payload.phone_number] - Contact phone number
 * @param {Object} [payload.custom_attributes] - Chatwoot custom fields
 * @param {string} [provider='chatwoot']
 * @returns {Promise<Object>} Updated/Inserted Contact Profile
 */
export async function syncContactFromChatwoot(db, tenantId, payload, provider = 'chatwoot') {
  if (!payload || !payload.id) {
    throw new Error('Invalid Chatwoot contact payload: missing external ID');
  }

  const externalId = String(payload.id);
  const displayName = payload.name || payload.pubkey || null;
  const email = payload.email ? String(payload.email).toLowerCase().trim() : null;
  const phone = payload.phone_number ? String(payload.phone_number).trim() : null;
  const customFields = payload.custom_attributes || {};

  return db.transaction(async (client) => {
    // 1. Check if an identity link already exists for this provider and external_id
    const identityRes = await client.query(
      `SELECT contact_id FROM contact_identities
       WHERE tenant_id = $1 AND provider = $2 AND external_id = $3`,
      [tenantId, provider, externalId],
    );

    let contactId = identityRes.rows[0]?.contact_id;

    if (!contactId && email) {
      // 2. Secondary matching by email in contact_profiles
      const emailRes = await client.query(
        `SELECT id FROM contact_profiles WHERE tenant_id = $1 AND email = $2`,
        [tenantId, email],
      );
      contactId = emailRes.rows[0]?.id;
    }

    if (!contactId && phone) {
      // 3. Tertiary matching by phone in contact_profiles
      const phoneRes = await client.query(
        `SELECT id FROM contact_profiles WHERE tenant_id = $1 AND phone = $2`,
        [tenantId, phone],
      );
      contactId = phoneRes.rows[0]?.id;
    }

    let contact;

    if (contactId) {
      // Update existing contact profile
      const updateRes = await client.query(
        `UPDATE contact_profiles
         SET display_name = COALESCE($1, display_name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             custom_fields = custom_fields || $4::jsonb,
             updated_at = now()
         WHERE id = $5 AND tenant_id = $6
         RETURNING *`,
        [displayName, email, phone, JSON.stringify(customFields), contactId, tenantId],
      );
      contact = updateRes.rows[0];
    } else {
      // Create new contact profile
      const insertRes = await client.query(
        `INSERT INTO contact_profiles (tenant_id, display_name, email, phone, custom_fields)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, displayName || `Contact ${externalId}`, email, phone, JSON.stringify(customFields)],
      );
      contact = insertRes.rows[0];
      contactId = contact.id;
    }

    // Upsert identity mapping
    await client.query(
      `INSERT INTO contact_identities (tenant_id, contact_id, provider, external_id, username, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, provider, external_id) DO UPDATE SET
         contact_id = EXCLUDED.contact_id,
         username = EXCLUDED.username,
         metadata = contact_identities.metadata || EXCLUDED.metadata`,
      [
        tenantId,
        contactId,
        provider,
        externalId,
        payload.username || null,
        JSON.stringify({ last_synced_at: new Date().toISOString() }),
      ],
    );

    return contact;
  });
}

/**
 * Pushes updated CRM Contact profile data out to Chatwoot Contact API.
 * @param {import('../db.js').Database} db
 * @param {string} tenantId
 * @param {string} contactId
 * @param {Object} options
 * @param {string} options.chatwootApiUrl
 * @param {string} options.chatwootApiToken
 * @param {number|string} options.chatwootAccountId
 * @returns {Promise<{ synced: boolean, externalId?: string, error?: string }>}
 */
export async function syncContactToChatwoot(db, tenantId, contactId, options = {}) {
  const contactRes = await db.query(
    'SELECT * FROM contact_profiles WHERE id = $1 AND tenant_id = $2',
    [contactId, tenantId],
  );

  if (!contactRes.rowCount) {
    throw new Error('Contact profile not found');
  }

  const contact = contactRes.rows[0];

  // Find linked Chatwoot external_id
  const identityRes = await db.query(
    `SELECT external_id FROM contact_identities
     WHERE tenant_id = $1 AND contact_id = $2 AND provider = 'chatwoot'`,
    [tenantId, contactId],
  );

  const externalId = identityRes.rows[0]?.external_id;

  if (!options.chatwootApiUrl || !options.chatwootApiToken || !options.chatwootAccountId) {
    return {
      synced: false,
      externalId,
      error: 'Missing Chatwoot connection credentials for outbound sync',
    };
  }

  const endpoint = externalId
    ? `${options.chatwootApiUrl}/api/v1/accounts/${options.chatwootAccountId}/contacts/${externalId}`
    : `${options.chatwootApiUrl}/api/v1/accounts/${options.chatwootAccountId}/contacts`;

  const method = externalId ? 'PUT' : 'POST';

  try {
    const response = await fetch(endpoint, {
      method,
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': options.chatwootApiToken,
      },
      body: JSON.stringify({
        name: contact.display_name,
        email: contact.email,
        phone_number: contact.phone,
        custom_attributes: contact.custom_fields,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { synced: false, externalId, error: `Chatwoot API returned ${response.status}: ${errText}` };
    }

    const data = await response.json();
    const cwContactId = String(data.payload?.contact?.id || data.id || externalId);

    if (!externalId && cwContactId) {
      // Record identity link
      await db.query(
        `INSERT INTO contact_identities (tenant_id, contact_id, provider, external_id, metadata)
         VALUES ($1, $2, 'chatwoot', $3, $4)
         ON CONFLICT (tenant_id, provider, external_id) DO NOTHING`,
        [tenantId, contactId, cwContactId, JSON.stringify({ synced_at: new Date().toISOString() })],
      );
    }

    return { synced: true, externalId: cwContactId };
  } catch (err) {
    return { synced: false, externalId, error: err.message };
  }
}
