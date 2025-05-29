const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const os = require('os');
const { MessageFactory } = require('botbuilder');
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
        const tempWavPath = path.join(os.tmpdir(), `converted-${Date.now()}.wav`);
        ffmpeg(inputPath)
            .outputOptions([
                '-acodec pcm_s16le',
                '-ar 16000',         
                '-ac 1'              
            ])
            .toFormat('wav')
            .on('error', reject)
            .on('end', () => resolve(tempWavPath))
            .save(tempWavPath);
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

    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(fs.readFileSync(filePath));
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, region);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    speechConfig.speechRecognitionLanguage = 'de-DE';


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
async function handleIncomingAudioAttachment(context, attachmentUrl, filename = 'user-input.wav') {
    const tempPath = path.resolve(__dirname, filename);
    await downloadAudioFile(attachmentUrl, tempPath);

    if (path.extname(tempPath).toLowerCase() !== '.wav') {
        tempPath = await convertToWav(tempPath);
    }

    sendAudioBackToUser(context, tempPath);
    const transcribedText = await transcribeSpeechFromFile(tempPath);
    fs.unlinkSync(tempPath); // Cleanup
    return transcribedText;
}

/**
 * Only for debug purposes
 * Sends back the audio file to the user to verify its integrity.
 * @param {*} context Bot TurnContext
 * @param {*} filePath Local path to the WAV file to send back
 * @param {*} message Optional message to display alongside the audio
 */
async function sendAudioBackToUser(context, filePath, message = 'Hier ist die Audioaufnahme, die ich empfangen habe:') {
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    const audioAttachment = {
        name: fileName,
        contentType: 'audio/wav',
        contentUrl: `data:audio/wav;base64,${fileContent.toString('base64')}`
    };

    const reply = MessageFactory.attachment(audioAttachment, message);
    await context.sendActivity(reply);
}


module.exports = { handleIncomingAudioAttachment };