const fs = require('fs');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { MessageFactory } = require('botbuilder');

/**
 * Turns text into speech using Azure Speech services
 * 
 * @param {*} text Text to turn into speech
 * @param {*} filePath where to save the output file
 * @returns 
 */
async function synthesizeSpeechToFile(text, filePath) {
    return new Promise((resolve, reject) => {
        const speechKey = retrieveSpeechKey();
        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, process.env.SPEECH_REGION);
        speechConfig.speechSynthesisLanguage = "de-DE";
        speechConfig.speechSynthesisVoiceName = "de-DE-KatjaNeural"; 

        const audioConfig = sdk.AudioConfig.fromAudioFileOutput(filePath);
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

        synthesizer.speakTextAsync(text, result => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                resolve(filePath);
            } else {
                reject(new Error("Speech synthesis failed"));
            }
        });
    });
}

/**
 * Generates a speech file from user text input and lets the bot reply with if
 * 
 * @param {*} context Bot context to send the reply
 * @param {*} textReply Text reply to user
 * @param {*} filePath Where to save the speech file
 */
async function sendVoiceReply(context, textReply, filePath = './bot-response.wav') {
    await synthesizeSpeechToFile(textReply, filePath);

    const fileBuffer = fs.readFileSync(filePath);
    const base64Audio = fileBuffer.toString('base64');
    const contentUrl = `data:audio/wav;base64,${base64Audio}`;

    const attachment = {
        name: 'bot-response.wav',
        contentType: 'audio/wav',
        contentUrl: contentUrl
    };

    const message = MessageFactory.attachment(attachment, textReply); // optional text transcript
    await context.sendActivity(message);
}

/**
 * Retrieves speech key from Azure Key Vault
 */
async function retrieveSpeechKey(){
const vaultName = process.env.KEY_VAULT_NAME;
const keyVaultUrl = `https://${vaultName}.vault.azure.net`;

const credential = new DefaultAzureCredential();
const client = new SecretClient(keyVaultUrl, credential);

// Gather secrets from Key Vault
const azureSpeechKey = await client.getSecret("speechKey");

return azureSpeechKey;
}

module.exports = { sendVoiceReply };