const fs = require('fs');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { MessageFactory } = require('botbuilder');
const path = require('path');

/**
 * Synthesizes text to speech and writes the result to a file manually using a PushAudioOutputStream
 * @param {string} text Text to convert to speech
 * @param {string} filePath Output WAV file path
 * @returns {Promise<string>} Resolves with file path
 */

async function synthesizeSpeechToFile(text, filePath) {
    if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
    }

    const speechKeySecret = await retrieveSpeechKey();
    const speechKey = speechKeySecret.value;
    const region = process.env.SPEECH_REGION;
    if (!region) throw new Error('Missing SPEECH_REGION');

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, region);
    speechConfig.speechSynthesisLanguage = 'de-DE';
    speechConfig.speechSynthesisVoiceName = 'de-DE-KatjaNeural';
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;

    const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
        synthesizer.speakTextAsync(
            text,
            result => {
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    const audioData = result.audioData;
                    const absolutePath = path.resolve(filePath);
                    fs.writeFileSync(absolutePath, Buffer.from(audioData));
                    console.log(`Audio saved to: ${absolutePath} (${audioData.byteLength} bytes)`);
                    resolve(absolutePath);
                } else {
                    reject(new Error('Synthesis failed: ' + result.errorDetails));
                }
            },
            error => reject(error)
        );
    });
}


/**
 * Sends a voice and text message reply using the bot context
 * @param {*} context Bot context
 * @param {string} textReply Text to convert and send
 * @param {string} filePath Optional file path (default: './bot-response.wav')
 */
async function sendVoiceReply(context, textReply, filePath = './bot-response.wav') {
    try {
        const synthesizedPath = await synthesizeSpeechToFile(textReply, filePath);

        const fileBuffer = fs.readFileSync(synthesizedPath);
        const base64Audio = fileBuffer.toString('base64');
        const contentUrl = `data:audio/wav;base64,${base64Audio}`;

        const attachment = {
            name: 'bot-response.wav',
            contentType: 'audio/wav',
            contentUrl: contentUrl
        };

        await context.sendActivity(textReply); // Send readable text
        await context.sendActivity(MessageFactory.attachment(attachment)); // Send voice response
    } catch (error) {
        console.error('Failed to send voice reply:', error);
        await context.sendActivity(`Fehler beim Generieren der Sprachantwort: ${error.message}`);
    }
}

/**
 * Retrieves the Azure Speech key from Key Vault
 * @returns {Promise<{ value: string }>}
 */
async function retrieveSpeechKey() {
    const vaultName = process.env.KEY_VAULT_NAME;
    if (!vaultName) {
        throw new Error('Missing KEY_VAULT_NAME environment variable');
    }

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

module.exports = { sendVoiceReply };