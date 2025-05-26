const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

/**
 * Retrieves the Azure Speech key from Key Vault
 * @returns Azure Speeck Key from Key Vault
 */
async function retrieveSpeechKey() {
    const vaultName = process.env.KEY_VAULT_NAME;
    if (!vaultName) throw new Error('Missing KEY_VAULT_NAME environment variable');

    const keyVaultUrl = `https://${vaultName}.vault.azure.net`;
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(keyVaultUrl, credential);

    try {
        return await client.getSecret('speechKey');
    } catch (error) {
        console.error('Failed to retrieve secret from Key Vault:', error);
        throw new Error('Could not retrieve speech key from Azure Key Vault');
    }
}

/**
 * Downloads audio from a URL to a temp file
 * @param url URL of the audio attachement
 * @param localPath filePath to save the new file to
 */
async function downloadAudioFile(url, localPath) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(localPath, response.data);
    return localPath;
}

/**
 * Transcribes an audio file to text
 * @param filePath the path to the file which to translate
 */
async function transcribeSpeechFromFile(filePath) {
    const speechKeySecret = await retrieveSpeechKey();
    const speechKey = speechKeySecret.value;
    const region = process.env.SPEECH_REGION;
    if (!region) throw new Error('Missing SPEECH_REGION');

    const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(filePath));
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, region);
    speechConfig.speechRecognitionLanguage = 'de-DE';

    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                resolve(result.text);
            } else {
                reject(new Error('Speech recognition failed: ' + result.errorDetails));
            }
        }, error => reject(error));
    });
}

/**
 * Handle incoming audio messages
 * @param attachmentUrl URL linked to the audio attachement
 * @param filename Name of the file where the input should be saved to
 * @returns The content of the audio file as text
 */
async function handleIncomingAudioAttachment(attachmentUrl, filename = 'user-input.wav') {
    const tempPath = path.resolve(__dirname, filename);
    await downloadAudioFile(attachmentUrl, tempPath);
    const transcribedText = await transcribeSpeechFromFile(tempPath);
    fs.unlinkSync(tempPath); // Cleanup
    return transcribedText;
}

module.exports = { handleIncomingAudioAttachment };