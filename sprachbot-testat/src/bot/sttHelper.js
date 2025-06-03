const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const os = require('os');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);


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
 * Converts an audio file input to .wav-format for further processing
 * @param {*} inputPath thepath to the file which to convert to .wav
 * @returns converted file
 */
function convertToWav(inputPath) {
    return new Promise((resolve, reject) => {
        const outputDir = path.resolve(__dirname, 'converted_files');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }
        const outputPath = path.join(outputDir, `converted-${Date.now()}.wav`);

        ffmpeg(inputPath)
            .format('wav')  // this is preferred over .toFormat()
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(16000)
            .on('error', reject)
            .on('end', () => resolve(outputPath))
            .save(outputPath);
    });
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

    const fileBuffer = fs.readFileSync(filePath);
    console.log(fileBuffer.slice(0, 12).toString('ascii'));
    const audioConfig = sdk.AudioConfig.fromWavFileInput(fileBuffer);
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, region);
    speechConfig.speechRecognitionLanguage = 'de-DE';
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);



    return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(result => {
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                resolve(result.text);
            } else {
                console.error('[SpeechRecognizer] Recognition failed:', {
                reason: result.reason,
                text: result.text,
                errorDetails: result.errorDetails,
                result
                });
                reject(new Error(`Speech recognition failed. Reason: ${sdk.ResultReason[result.reason]}`));
        }
        }, error => {
            console.error('[SpeechRecognizer] Fatal error:', error);
            reject(error);
            });
    });
}

/**
 * Handle incoming audio messages
 * @param attachmentUrl URL linked to the audio attachement
 * @param filename Name of the file where the input should be saved to
 * @returns The content of the audio file as text
 */
async function handleIncomingAudioAttachment(attachmentUrl, filename = 'user-input.wav') {
    let tempPath = path.resolve(__dirname, filename);
    await downloadAudioFile(attachmentUrl, tempPath);

    if (path.extname(tempPath).toLowerCase() !== '.wav') {
        tempPath = await convertToWav(tempPath);
    }

    const transcribedText = await transcribeSpeechFromFile(tempPath);
    return transcribedText;
}

module.exports = { handleIncomingAudioAttachment };