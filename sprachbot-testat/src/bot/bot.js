const { ActivityHandler, MessageFactory } = require('botbuilder');
const messages = require('./botMessages');
const UserTO = require('../data/UserTO');
const { sendVoiceReply } = require('./ttsHelper');
const botMessages = require('./botMessages');
const { handleIncomingAudioAttachment } = require('./sttHelper');

//supported audio types for user audio input
const SUPPORTED_AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/m4a'];

/**
 * Contains the bot's conversational logic.
 */
class EchoBot extends ActivityHandler {
    constructor(cluClient) {
        super();
        this.cluClient = cluClient;
        this.requiredInformation = ["Vorname", "Nachname", "Geburtsdatum", "Land", "Stadt", "Straße", "Hausnummer", "Postleitzahl", "eMail", "Telefonnummer"];
        this.state = "awaitingInformation";
        this.currentInput = null;

        this.onMessage(async (context, next) => {
            if (context.activity.attachments && context.activity.attachments.length > 0) {
                const audioAttachment = context.activity.attachments.find(att =>
                    SUPPORTED_AUDIO_TYPES.includes(att.contentType)
                    );

                try {
                    var text = await handleIncomingAudioAttachment(audioAttachment.contentUrl);
                } catch (err) {
                    console.error(err);
                    await sendVoiceReply(context, botMessages.voiceTranscriptionError);
                }
        }
            
            text = context.activity.text;

            const result = await this.cluClient.analyzeConversation({
                kind: "Conversation",
                analysisInput: {
                    conversationItem: {
                        id: "1",
                        participantId: "user",
                        text: text
                    },
                    modality: "text",
                    language: "de"
                },
                parameters: {
                    projectName: process.env.CLU_PROJECT_NAME,
                    deploymentName: process.env.CLU_DEPLOYMENT_NAME,
                    stringIndexType: "Utf16CodeUnit"
                }
            });

            const topIntent = result.result.prediction.topIntent;
            const entities = result.result.prediction.entities;

            await this.processUserMessage(topIntent, entities, context);
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            for (const member of context.activity.membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    this.user = new UserTO();
                    await sendVoiceReply(context, messages.welcomeMsg);
                    await this.askForInformation(context);
                
                }
            }
            await next();
        });
    }

    /**
     * Processes a user message, based on the intent of the user.
     * 
     * @param {*} topIntent The intent of the user, recognized by the CLU model
     * @param {*} entities The entities of the user message, containing information
     * @param {*} context Bot context needed for responding
     */
    async processUserMessage(topIntent, entities, context) {
        switch (topIntent) {
            case "enterInformation":
                await this.processInformation(entities, context);
                break;

            case "confirmation":
                await this.handleConfirm(entities, context);
                break;

            default:
                await sendVoiceReply(context, messages.internalError);
                this.askForInformation(context);
                break;
        }
    }

    /**
     * Processes personal information entered by the user.
     * 
     * @param {*} context Bot context needed for responding
     * @param {*} entities The entities of the user message, containing information
     */
    async processInformation(entities, context) {
        if (this.state !== "awaitingInformation") {
            await sendVoiceReply(context, messages.clarifyConfirmation);
            return;
        }
        await this.verifyInput(entities, context);
    }

    /**
     * Handles confirmation from the user and continues the process.
     * 
     * @param {*} context Bot context needed for responding
     * @param {*} entities The entities of the user message, containing information
     */
    async handleConfirm(entities, context) {
        if (this.state !== "awaitingConfirmation") {
            await this.askForInformation(context);
            return;
        }

        const confirmed = entities.find(e => e.category === "confirm");
        const rejected = entities.find(e => e.category === "reject");

        if (confirmed) {
            saveUserInput(this.currentInput, this.requiredInformation[0], this.user);
            this.requiredInformation.shift();
            await sendVoiceReply(context, messages.confirmSave);
            await this.askForInformation(context);
        } else if (rejected) {
            await this.askForInformation(context);
        } else {
            await sendVoiceReply(context, messages.clarifyConfirmation);
        }
    }

    /**
     * Verifies the user input by asking for their confirmation.
     * 
     * @param {*} context Bot context needed for responding
     * @param {*} entities The entities of the user message, containing information
     */
    async verifyInput(entities, context) {
        let currentInformation = this.requiredInformation[0];
        let relevantInformation = currentInformation;
        
        if(currentInformation === "Nachname" || currentInformation === "Vorname"){
            relevantInformation = "Name";
        }

        const entityValue = extractEntityValue(entities, relevantInformation, context);

        this.currentInput = entityValue;
        this.state = "awaitingConfirmation";

        await sendVoiceReply(context, messages.repeatInput(entityValue, currentInformation));
    }

    /**
     * Asks the user for the next required piece of information.
     * 
     * @param {*} context Bot context needed for responding
     */
    async askForInformation(context) {
        if (this.requiredInformation.length === 0) {
            await sendVoiceReply(context, messages.endOfProcess);
            createUser(this.user);
            return;
        }

        const currentInformation = this.requiredInformation[0];
        this.state = "awaitingInformation";
        await sendVoiceReply(context, messages.askForInformation(currentInformation));
    }
}

/**
 * Extracts a given entity value for a certain category from a given set of entities.
 * 
 * @param {*} entities The entities of the user message, containing information
 * @param {*} category The category to fetch a value for
 * @param {*} context Bot context to extract original input from if no matching entity is found
 */
function extractEntityValue(entities, category, context) {
    const entity = entities.find(e => e.category === category);
    let text;

    if(entity === undefined){
        text = context.activity.text;
    }else{
        text = entity.text;
    }
    return text;
}

/**
 * Saves user input in the user object.
 * @param {*} input The user input to save
 * @param {*} category The category to save the user input in
 * 
 */
function saveUserInput(input, category, user) {
    user[category] = input;
}

/**
 * Saves the user in the database
 * @param {*} user 
 */
async function createUser(user){
    const dataManager = require('../data/dataManager');
    dataManager.insertUser(user);
    dataManager.getUsers();
    dataManager.destroyDb();
}

module.exports = { EchoBot };