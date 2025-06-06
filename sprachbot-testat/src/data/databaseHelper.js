const { DefaultAzureCredential } = require("@azure/identity");
const sql = require("mssql");

let connectionPool;

/**
 * Establishes a connection to Azure SQL DB using managed identity
 */
async function createDbConnection() {
  if (connectionPool) {
    return connectionPool;
  }
  const credential = new DefaultAzureCredential();
  const tokenResponse = await credential.getToken("https://database.windows.net/");

  connectionPool = await sql.connect({
    server: `${process.env.DATABASE_SERVER_NAME}.database.windows.net`,
    database: process.env.DATABASE_NAME,
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
          token: tokenResponse.token,
      },
    },
    options: {
      encrypt: true,
    }
});


  return connectionPool;
}

async function closeDbConnection() {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
  }
}

module.exports = {
  createDbConnection,
  closeDbConnection
};
