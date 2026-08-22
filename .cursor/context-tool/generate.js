const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const OUTPUT_FILE = path.join(__dirname, 'compact-context.md');

// Static metadata of file roles in chatbot Dashboard
const FILE_PURPOSES = {
  'access.js': 'Handles database-level authorization, workspace tenant access control, and operator upserts.',
  'identity-provider.js': 'Provisions and controls employee identities through the least-privileged Keycloak administration client.',
  'chatwoot-platform.js': 'Uses Chatwoot Platform APIs to provision account-scoped agents and issue validated short-lived SSO links.',
  'app.js': 'Express application configuration, mounts middlewares (logging, CORS, JSON), handles authentication routing (/v1), and maps routes to prefix paths.',
  'auth.js': 'Keycloak JWT verification middleware, OIDC token parsing, and user role extraction.',
  'config.js': 'Parses and validates environment variables with sensible defaults and error handling.',
  'db.js': 'Initializes PostgreSQL pool client (`pg`), manages query helper wrapper, and provides transaction execution workflows.',
  'migrate.js': 'Executes SQL database migrations in sequential order and tracks schema version history.',
  'server.js': 'Main backend entrypoint. Connects to Postgres & Redis pools, and launches the HTTP server.',
  'validation.js': 'Zod-backed utility functions for query parsing, pagination params, and validation schemas.',
  'bridge/queue.js': 'Implements Redis-backed asynchronous message queues with backoff retries & DLQ. Gracefully falls back to promise-based serial chains on Redis outage.',
  'bridge/replies.js': 'Parses and extracts answers from Typebot flow engine and structures replies to be pushed back to Chatwoot.',
  'bridge/webhook.js': 'Filters, cleans, and parses incoming webhook payloads from Chatwoot, safeguarding operator privacy.',
  'crm/contact-sync.js': 'Synchronizes contacts bi-directionally between the Chatwoot contact catalog and the canonical Control Plane CRM contacts database.',
  'rag/rag-engine.js': 'AI content processor. Handles token chunking, pgvector semantic search, similarity embeddings, and agent handoff configurations.',
  'routes/ai-rag.js': 'REST endpoints for managing semantic policies, chunking documents, and querying knowledge vectors.',
  'routes/automations.js': 'REST endpoints for CRUD on flow definitions, metadata, and publishing version snapshots.',
  'routes/bridge-internal.js': 'Internal REST endpoints for webhook ingestion and resolver mappings.',
  'routes/channels.js': 'REST endpoints for creating, activating, and updating multi-channel connection credentials.',
  'routes/contacts.js': 'REST endpoints for Contact Profiles and Identities CRM actions, and outbound sync requests.',
  'routes/knowledge.js': 'REST endpoints for document source CRUD, chunk indexing, and raw file uploads.',
  'routes/operators.js': 'Administrator-only employee lifecycle and many-to-many company assignment APIs with audit logging.',
  'routes/products.js': 'REST endpoints for CRUD on unified products catalogs, conversion of price metrics, and stock allocations.',
  'routes/sessions.js': 'Creates tenant-authorized downstream engine sessions without exposing persistent service credentials.',
  'routes/tenants.js': 'REST endpoints for listing memberships and registering new tenant workspaces.',
  'routes/webhooks.js': 'The event loop webhooks orchestrator. Manages Typebot sessions, continueChat/startChat API routing, and direct response dispatch back to Chatwoot.',
  'main.jsx': 'Frontend entrypoint. Initializes Keycloak OIDC SSO, implements administrator employee management and tenant-scoped native screens, and manages the workspace switcher.',
  'styles.css': 'Centralized UI styling sheet for dashboard screens, layout, dark mode colors, and sidebar menus.'
};

function parseJSFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const lines = code.split('\n');
  const lineCount = lines.length;

  const functions = [];
  const imports = [];

  // Parse imports/requires
  const importRegex = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let importMatch;
  while ((importMatch = importRegex.exec(code)) !== null) {
    const dep = importMatch[1] || importMatch[2];
    if (dep && (dep.startsWith('.') || dep.startsWith('..'))) {
      imports.push(path.basename(dep));
    }
  }

  // Parse functions
  // 1. Standard functions: function name(args)
  const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    functions.push({ name: match[1], params: match[2].trim().replace(/\s+/g, ' ') });
  }

  // 2. Arrow functions: const name = (args) =>
  const arrowRegex = /(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g;
  while ((match = arrowRegex.exec(code)) !== null) {
    functions.push({ name: match[1], params: match[2].trim().replace(/\s+/g, ' ') });
  }

  // 3. Class declarations
  const classRegex = /(?:export\s+)?class\s+([a-zA-Z0-9_]+)/g;
  while ((match = classRegex.exec(code)) !== null) {
    functions.push({ name: `Class: ${match[1]}`, params: '' });
  }

  // 4. Methods within files or classes (e.g. "myMethod(args) {")
  const methodRegex = /(?:async\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
  const reservedWords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'forEach', 'map', 'filter', 'reduce', 
    'then', 'require', 'import', 'export', 'return', 'createApp', 'createDatabase',
    'and', 'or', 'not', 'assert', 'expect'
  ]);
  while ((match = methodRegex.exec(code)) !== null) {
    const methodName = match[1];
    if (!reservedWords.has(methodName) && !functions.some(f => f.name === methodName)) {
      functions.push({ name: `Method: ${methodName}`, params: match[2].trim().replace(/\s+/g, ' ') });
    }
  }

  return {
    lineCount,
    imports: [...new Set(imports)],
    functions: [...new Set(functions.map(f => `${f.name}(${f.params})`))]
  };
}

function run() {
  console.log('Generating comprehensive compact context...');
  let content = '';

  content += '# My AI Desk — Compact Project Context\n\n';
  content += `*Generated automatically on: ${new Date().toUTCString()}*\n\n`;
  content += 'This file is a generated technical index for fast context recovery. `docs/PRODUCT_DEFINITION.md` remains canonical for product scope, users, roles, and access rules.\n\n';

  // Canonical product scope. Keep this short and stable so regeneration never
  // erases the access model that every future session must recover first.
  content += '## 0. Canonical Product Definition\n\n';
  content += '- My AI Desk is an internal platform for the platform administrator and administrator-created employees.\n';
  content += '- Client companies receive a managed service and do not receive My AI Desk accounts or log in.\n';
  content += '- The platform administrator can access every company, employee, configuration area, conversation, and audit record.\n';
  content += '- Employees can access only explicitly assigned companies. The relationship is many-to-many: one employee may manage multiple companies, and one company may have multiple employees.\n';
  content += '- Every company is an isolated tenant. Tenant boundaries must be enforced server-side across APIs, database queries, queues, caches, AI retrieval, files, exports, logs, and credentials.\n';
  content += '- The server automation runtime operates continuously and independently of the dashboard.\n';
  content += '- The target architecture must support approximately 1,000 client companies and grow beyond that without deploying a full stack per company.\n';
  content += '- Full definition: [`docs/PRODUCT_DEFINITION.md`](../../docs/PRODUCT_DEFINITION.md).\n\n';

  // Section 1: System Core Architecture
  content += '## 1. System Core Architecture\n\n';
  content += '- **Control Plane** (Express, PostgreSQL, Keycloak): Central backend managing tenants, CRM contacts, products catalog, automations registry, and knowledge sources (RAG with `pgvector`). Includes the merged Webhook Ingestion & Event Bridge.\n';
  content += '- **Dashboard** (React, Keycloak OIDC, Vite): Internal interface for the platform administrator and employees. The administrator manages all companies and employee assignments; employees operate only explicitly assigned companies and may be assigned to more than one. Client companies do not log in. It includes AI policy, ready replies, native screens (Contacts, Products, Knowledge, Automations), and integrated access to Chatwoot and Typebot. It does not need to stay open for server automation to run.\n';
  content += '- **Chatwoot**: The only human inbox. Manages assignments, SLAs, and direct agent/operator communication.\n';
  content += '- **Typebot**: Conversation graph execution engine.\n';
  content += '- **SSO & Keycloak**: Keycloak is the single user entry point. Typebot uses OIDC, while the Control Plane uses Chatwoot Platform APIs to provision account-scoped agents and issue short-lived one-time inbox login links.\n\n';

  // Section 2: Infrastructure & Services
  content += '## 2. Docker Infrastructure & Services\n\n';
  try {
    const dockerComposePath = path.join(ROOT_DIR, 'docker-compose.yml');
    if (fs.existsSync(dockerComposePath)) {
      const yaml = fs.readFileSync(dockerComposePath, 'utf8');
      const lines = yaml.split('\n');
      let currentService = null;
      const services = [];
      let inServicesSection = false;

      lines.forEach((line) => {
        if (line.match(/^services:/)) {
          inServicesSection = true;
          return;
        }
        if (inServicesSection && line.match(/^[a-zA-Z0-9_-]+:/)) {
          inServicesSection = false;
          return;
        }

        if (!inServicesSection) return;

        const serviceMatch = line.match(/^  ([a-zA-Z0-9_-]+):/);
        if (serviceMatch) {
          currentService = { name: serviceMatch[1], image: 'N/A', ports: 'N/A' };
          services.push(currentService);
        } else if (currentService) {
          const imageMatch = line.match(/^\s+image:\s*['"]?([^\s'"]+)['"]?/);
          if (imageMatch) {
            currentService.image = imageMatch[1];
          }
          const portsMatch = line.match(/^\s+ports:\s*-\s*['"]?([^'"\s]+)['"]?/);
          if (portsMatch) {
            currentService.ports = portsMatch[1];
          }
        }
      });

      content += '| Service | Image | Ports |\n| --- | --- | --- |\n';
      services.forEach((s) => {
        content += `| \`${s.name}\` | \`${s.image}\` | ${s.ports !== 'N/A' ? `\`${s.ports}\`` : '*Internal*'} |\n`;
      });
      content += '\n';
    }
  } catch (err) {
    content += `*Error reading docker-compose.yml: ${err.message}*\n\n`;
  }

  // Section 3: Database Tables & Schema
  content += '## 3. Database Schema (PostgreSQL)\n\n';
  try {
    const migrationsDir = path.join(ROOT_DIR, 'control-plane/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).sort();
      files.forEach((file) => {
        if (file.endsWith('.sql')) {
          const filePath = path.join(migrationsDir, file);
          const sql = fs.readFileSync(filePath, 'utf8');
          
          const tableRegex = /CREATE TABLE\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/g;
          let match;
          while ((match = tableRegex.exec(sql)) !== null) {
            const tableName = match[1];
            const tableBody = match[2];
            
            content += `### Table: \`${tableName}\`\n`;
            const columns = [];
            const bodyLines = tableBody.split('\n');
            bodyLines.forEach((line) => {
              line = line.trim();
              if (!line || line.startsWith('--') || line.startsWith('PRIMARY KEY') || line.startsWith('UNIQUE') || line.startsWith('CREATE INDEX')) return;
              
              const parts = line.split(/\s+/);
              if (parts.length >= 2) {
                let columnName = parts[0];
                let columnType = parts[1].replace(/,$/, '');
                
                if (columnName.toUpperCase() === 'CONSTRAINT' || columnName.toUpperCase() === 'FOREIGN') return;
                
                let extra = '';
                if (line.includes('PRIMARY KEY')) extra += ' PK';
                if (line.includes('REFERENCES')) {
                  const refMatch = line.match(/REFERENCES\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)/i);
                  if (refMatch) {
                    extra += ` FK -> ${refMatch[1]}(${refMatch[2]})`;
                  } else {
                    extra += ' FK';
                  }
                }
                columns.push(`- \`${columnName}\`: \`${columnType}\`${extra}`);
              }
            });
            content += columns.join('\n') + '\n\n';
          }
        }
      });

      files.forEach((file) => {
        if (!file.endsWith('.sql')) return;
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const alterRegex = /ALTER TABLE\s+([a-zA-Z0-9_]+)([\s\S]*?);/g;
        let alterMatch;
        while ((alterMatch = alterRegex.exec(sql)) !== null) {
          const additions = [...alterMatch[2].matchAll(/ADD COLUMN\s+([a-zA-Z0-9_]+)\s+([^\s,]+)/gi)];
          if (!additions.length) continue;
          content += `### Later columns added to \`${alterMatch[1]}\`\n`;
          additions.forEach((addition) => {
            content += `- \`${addition[1]}\`: \`${addition[2]}\`\n`;
          });
          content += '\n';
        }
      });
    }
  } catch (err) {
    content += `*Error reading database schema: ${err.message}*\n\n`;
  }

  // Section 4: API Route Maps
  content += '## 4. Control Plane API Routes\n\n';
  const routePrefixes = {
    'tenants.js': '/v1/tenants',
    'contacts.js': '/v1/tenants/:tenantId/contacts',
    'automations.js': '/v1/tenants/:tenantId/automations',
    'products.js': '/v1/tenants/:tenantId/products',
    'knowledge.js': '/v1/tenants/:tenantId/knowledge',
    'channels.js': '/v1/tenants/:tenantId/channels',
    'ai-rag.js': '/v1/tenants/:tenantId/ai',
    'manychat.js': '/v1/tenants/:tenantId/manychat',
    'operators.js': '/v1/operators',
    'sessions.js': '/v1/sessions',
    'webhooks.js': '/webhooks',
    'bridge-internal.js': '/internal/v1/bridge'
  };

  try {
    const routesDir = path.join(ROOT_DIR, 'control-plane/src/routes');
    if (fs.existsSync(routesDir)) {
      const files = fs.readdirSync(routesDir);
      files.forEach((file) => {
        if (file.endsWith('.js')) {
          const filePath = path.join(routesDir, file);
          const code = fs.readFileSync(filePath, 'utf8');
          const prefix = routePrefixes[file] || '/v1';
          
          content += `### Routes in \`src/routes/${file}\` (Mounted at \`${prefix}\`)\n`;
          
          const routesFound = [];
          const routeRegex = /router\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
          let match;
          while ((match = routeRegex.exec(code)) !== null) {
            const method = match[1].toUpperCase();
            let subpath = match[2];
            let fullpath = prefix === '/' ? subpath : `${prefix}${subpath === '/' ? '' : subpath}`;
            routesFound.push(`- **${method}** \`${fullpath}\``);
          }
          
          if (routesFound.length > 0) {
            content += routesFound.join('\n') + '\n\n';
          } else {
            content += '- *No direct routes matching pattern found (possibly dynamically loaded or custom exports).*\n\n';
          }
        }
      });
    }
  } catch (err) {
    content += `*Error reading routes: ${err.message}*\n\n`;
  }

  // Section 5: Codebase Landscape & Function Index
  content += '## 5. Codebase Landscape & Functions Index\n\n';
  content += 'Below is a recursive index of all files in the control-plane and dashboard showing their line counts, purpose, dependencies, and all parsed functions/methods. Use this to find functions without opening files.\n\n';

  function walkAndParse(dir, filterExt) {
    const results = [];
    function walk(currentDir) {
      const list = fs.readdirSync(currentDir);
      list.forEach((file) => {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          // Avoid scanning node_modules or .git or dist
          if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'migrations' && file !== 'test') {
            walk(fullPath);
          }
        } else if (file.endsWith(filterExt) || (filterExt === '.js' && file.endsWith('.jsx'))) {
          results.push(fullPath);
        }
      });
    }
    walk(dir);
    return results;
  }

  try {
    const srcFolders = [
      { name: 'control-plane/src', path: path.join(ROOT_DIR, 'control-plane/src'), ext: '.js' },
      { name: 'dashboard/src', path: path.join(ROOT_DIR, 'dashboard/src'), ext: '.jsx' }
    ];

    srcFolders.forEach((folder) => {
      if (fs.existsSync(folder.path)) {
        content += `### Directory: \`${folder.name}\`\n\n`;
        const files = walkAndParse(folder.path, folder.ext);
        
        files.sort().forEach((filePath) => {
          const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
          const fileName = path.basename(filePath);
          const parsed = parseJSFile(filePath);
          const purpose = FILE_PURPOSES[fileName] || FILE_PURPOSES[`${path.basename(path.dirname(filePath))}/${fileName}`] || 'Application source logic.';

          content += `#### File: \`${relativePath}\` (${parsed.lineCount} lines)\n`;
          content += `- **Role**: ${purpose}\n`;
          if (parsed.imports.length > 0) {
            content += `- **Dependencies (Imports)**: ${parsed.imports.map(i => `\`${i}\``).join(', ')}\n`;
          }
          if (parsed.functions.length > 0) {
            content += `- **Functions / Methods**:\n`;
            parsed.functions.forEach((f) => {
              content += `  - \`${f}\`\n`;
            });
          } else {
            content += `- **Functions / Methods**: *None declared directly at top-level.*\n`;
          }
          content += '\n';
        });
      }
    });
  } catch (err) {
    content += `*Error parsing codebase landscape: ${err.message}*\n\n`;
  }

  // Section 6: Roadmap & Execution State
  content += '## 6. Development Progress & Roadmap\n\n';
  try {
    const roadmapPath = path.join(ROOT_DIR, 'docs/ROADMAP.md');
    if (fs.existsSync(roadmapPath)) {
      const md = fs.readFileSync(roadmapPath, 'utf8');
      
      const inProgressMatch = md.match(/## In Progress([\s\S]*?)(?:## Next|## Single|$)/);
      if (inProgressMatch) {
        content += '### Current Phase (In Progress)\n';
        content += inProgressMatch[1].trim() + '\n\n';
      }
      
      const nextMatch = md.match(/## Next([\s\S]*?)(?:## Single|$)/);
      if (nextMatch) {
        content += '### Next Objectives\n';
        content += nextMatch[1].trim() + '\n\n';
      }
    }
  } catch (err) {
    content += `*Error reading ROADMAP.md: ${err.message}*\n\n`;
  }

  // Ensure output directory exists and write content
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
  console.log(`Comprehensive compact context successfully generated at: ${OUTPUT_FILE}`);
}

run();
