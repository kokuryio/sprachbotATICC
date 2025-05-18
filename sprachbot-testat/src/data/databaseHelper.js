const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const knex = require("knex");

/**
 * Retrieves database connection secrets from key vault and establishes DB
 * connection using knex.js
 */
const vaultName = process.env.KEY_VAULT_NAME;
const keyVaultUrl = `https://${vaultName}.vault.azure.net`;

const credential = new DefaultAzureCredential();
const client = new SecretClient(keyVaultUrl, credential);

async function createDbConnection() {
  // Gather secrets from Key Vault
  const dbUsernameSecret = await client.getSecret("database-user");
  const dbPwdSecret = await client.getSecret("database-password");
  const dbUsername = dbUsernameSecret.value;
  const dbPwd = dbPwdSecret.value;

  const serverName = process.env.DATABASE_SERVER_NAME;
  const databaseName = process.env.DATABASE_NAME;

  const db = knex({
    client: "mssql",
    connection: {
      user: dbUsername,
      password: dbPwd,
      server: `${serverName}.database.windows.net`,
      database: databaseName,
      options: {
        encrypt: true,
        enableArithAbort: true,
      },
    },
    pool: {
      min: 2,
      max: 10,
    },
  });

  return db;
}

module.exports = createDbConnection;