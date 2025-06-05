const { DefaultAzureCredential } = require("@azure/identity");
const knex = require("knex");
const sql = require("mssql");

/**
 * Establishes a connection to Azure SQL DB using managed identity
 */
async function createDbConnection() {
  const credential = new DefaultAzureCredential();
  const serverName = process.env.DATABASE_SERVER_NAME;
  const databaseName = process.env.DATABASE_NAME;

  // Get access token for Azure SQL
  const accessToken = (await credential.getToken("https://database.windows.net/")).token;

  const db = knex({
    client: "mssql",
    connection: {
      server: `${serverName}.database.windows.net`,
      database: databaseName,
      options: {
        encrypt: true,
        enableArithAbort: true,
        accessToken: accessToken
      }
    },
    pool: {
      min: 2,
      max: 10,
    },
  });

  return db;
}

module.exports = createDbConnection;