const fs = require('fs');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { MessageFactory } = require('botbuilder');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const MAX_BYTES = 25600;

/**
 * Split a file into smaller chunks, each under MAX_BYTES
 * @param {string} inputPath - path to compressed .ogg
 * @returns {Promise<string[]>} - array of chunk file paths
 */
async function splitAudioBySize(inputPath) {
    const chunksDir = path.join(path.dirname(inputPath), 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });

    const stats = fs.statSync(inputPath);
    const totalSize = stats.size;
    const numChunks = Math.ceil(totalSize / MAX_BYTES);

    const chunkPaths = [];

    // Estimate duration of input file to split proportionally
    const duration = await getAudioDuration(inputPath);

    for (let i = 0; i < numChunks; i++) {
        const startTime = (i * duration) / numChunks;
        const outputPath = path.join(chunksDir, `chunk_${i}.ogg`);
        chunkPaths.push(outputPath);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .seekInput(startTime)
                .duration(duration / numChunks)
                .outputOptions(['-c:a libopus', '-b:a 32k'])
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    }

    return chunkPaths;
}

/**
 * Get audio duration in seconds
 * @param {string} filePath
 * @returns {Promise<number>}
 */
function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format.duration);
        });
    });
}

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
async function sendVoiceReply(context, textReply, wavPath = './bot-response.wav', oggPath = './bot-response.ogg') {
    try {
        const spokenText = expandNumbersForSpeech(textReply);
        const synthesizedPath = await synthesizeSpeechToFile(textReply, wavPath);
        const compressedPath = await compressAudio(spokenText, oggPath);

        const fileSize = fs.statSync(compressedPath).size;

        await context.sendActivity({ text: textReply, textFormat: 'plain' }); 

        if (fileSize <= MAX_BYTES) {
            // Send single file
            const buffer = fs.readFileSync(compressedPath);
            const base64Audio = buffer.toString('base64');
            const contentUrl = `data:audio/ogg;base64,${base64Audio}`;

            const attachment = {
                name: path.basename(compressedPath),
                contentType: 'audio/ogg',
                contentUrl
            };

            await context.sendActivity(MessageFactory.attachment(attachment));
        } else {
            // Too large — split into smaller chunks
            const chunkPaths = await splitAudioBySize(compressedPath);

            for (const chunkPath of chunkPaths) {
                const buffer = fs.readFileSync(chunkPath);
                const base64Audio = buffer.toString('base64');
                const contentUrl = `data:audio/ogg;base64,${base64Audio}`;

                const attachment = {
                    name: path.basename(chunkPath),
                    contentType: 'audio/ogg',
                    contentUrl
                };

                await context.sendActivity(MessageFactory.attachment(attachment));
            }
        }

    } catch (error) {
        console.error('Failed to send voice reply:', error);
        await context.sendActivity(`Fehler beim Generieren der Sprachantwort: ${error.message}`);
    }
}

/**
 * Compresses the audio to a .ogg-File to send longer voice replies
 * @param {*} inputPath path to audio to compress
 * @param {*} outputPath path to resulting audio
 * @returns Promise which resolves in saving the audio file to output path
 */
function compressAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioCodec('libopus')
            .audioBitrate('32k')
            .format('ogg')
            .outputOptions(['-vn']) 
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .save(outputPath);
    });
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

/**
 * Expands numbers to digit-by-digit for TTS, except for year-like values (e.g., 1990, 2023).
 * @param {string} input
 * @returns {string} text to read out aloud
 */
function expandNumbersForSpeech(input) {
    return input.replace(/\d+/g, num => {
        const n = parseInt(num, 10);

        // Skip expansion if it's a year between 1900 and 2099
        if (n >= 1900 && n <= 2099) return num;

        // Otherwise, expand digits with spaces (e.g., 123 → "1 2 3")
        return num.split('').join(' ');
    });
}



module.exports = { sendVoiceReply };