const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const mysql = require("mysql2/promise");

const client = new SecretsManagerClient({ region: "eu-central-1" });

let connectionPool;

/**
 * Establishes a connection to AWS mysql db
 */
async function createDbConnection() {
   if (connectionPool) {
    return connectionPool;
  }

  const secrets = await getSecret(process.env.DB_SECRET_NAME);

  connectionPool = await mysql.createPool({
    host: secrets.host,
    user: secrets.username,
    password: secrets.password,
    database: secrets.dbname,
    port: secrets.port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return connectionPool;
}

async function closeDbConnection() {
  if (connectionPool) {
    await connectionPool.end();
    connectionPool = null;
  }
}

async function getSecret(secretName) {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if ("SecretString" in response) {
      return JSON.parse(response.SecretString);        
    } else {
      const buff = Buffer.from(response.SecretBinary, "base64");
      return buff.toString("ascii");
    }
  } catch (err) {
    console.error("Error fetching secret:", err);
    throw err;
  }
}

const databaseHelper = {
  createDbConnection,
  closeDbConnection
};

module.exports = databaseHelper;
