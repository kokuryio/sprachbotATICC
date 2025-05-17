const { ConversationAnalysisClient } = require("@azure/ai-language-conversations"); // changed here
const { AzureKeyCredential } = require("@azure/core-auth");
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

/**
 * Retrieves the CLU API key from key vault and establishes a connection to the 
 * trained CLU model in azure
 * 
 * @returns The created CLU client
 */
async function createCLUClient() {
    const vaultName = process.env.KEY_VAULT_NAME;
    const cluEndpoint = process.env.AZURE_LANGUAGE_ENDPOINT;
    const keyVaultUrl = `https://${vaultName}.vault.azure.net`;

    const credential = new DefaultAzureCredential();
    const client = new SecretClient(keyVaultUrl, credential);

    const secret = await client.getSecret("cluSecret");
    const cluKey = secret.value;

    return new ConversationAnalysisClient(  // changed here
        cluEndpoint,
        new AzureKeyCredential(cluKey)
    );
}

module.exports = { createCLUClient };