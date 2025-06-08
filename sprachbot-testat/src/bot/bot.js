const { ActivityHandler, MessageFactory } = require('botbuilder');
const messages = require('./botMessages');
const UserTO = require('../data/UserTO');
const { sendVoiceReply } = require('./ttsHelper');
const botMessages = require('./botMessages');
const { handleIncomingAudioAttachment } = require('./sttHelper');
const validator = require('validator');
const countries = require("i18n-iso-countries");


//supported audio types for user audio input
const SUPPORTED_AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/ogg'];

/**
 * Contains the bot's conversational logic.
 */
class EchoBot extends ActivityHandler {
    constructor(cluClient) {
        super();
        this.user = new UserTO();
        this.cluClient = cluClient;
        this.requiredInformation = ["Vorname", "Nachname", "Geburtsdatum", "Land", "Stadt", "Straße", "Hausnummer", "Postleitzahl", "eMail", "Telefonnummer"];
        this.state = "awaitingInformation";
        this.currentInput = null;

        this.onMessage(async (context, next) => {

            //Process audio attachements
            if (context.activity.attachments && context.activity.attachments.length > 0) {
                const audioAttachment = context.activity.attachments.find(att =>
                    SUPPORTED_AUDIO_TYPES.includes(att.contentType)
                    );

                try {
                    var text = await handleIncomingAudioAttachment(audioAttachment.contentUrl);
                    console.log(`Received ${text} as output from speach recognition`);
                } catch (err) {
                    console.error(err);
                    await sendVoiceReply(context, botMessages.voiceTranscriptionError);
                }
        }else{
                text = context.activity.text;
        }
            

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

        //Send welcome text/voice messages
        this.onMembersAdded(async (context, next) => {
            for (const member of context.activity.membersAdded) {
                if (member.id !== context.activity.recipient.id) {
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
        console.log("Input to be checked for format: ");
        console.log(this.currentInput);
        if(this.verifyInputFormat()){
            this.state = "awaitingConfirmation";
            await sendVoiceReply(context, messages.repeatInput(entityValue, currentInformation));
        }else{
           await this.clarifyInputFormat(context);
        }
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

    /**
     * Checks if the current given input is valid in format
     * @returns true if input is valid
     */
    verifyInputFormat(){
        switch(this.requiredInformation[0]){
            case "Vorname":
                return true;

            case "Nachname":
                return true;
            
            case "Geburtsdatum":
                return this.checkBirthDateFormat();
            
            case "Stadt":
                return true;

            case "Straße":
                return true;

            case "Postleitzahl":
                return this.checkPostCode();

            case "Land":
                return this.checkCountry();

            case "eMail":
                return this.checkMail();

            case "Hausnummer":
                return this.checkHouseNumber();

            case "Telefonnummer":
                return this.checkPhoneNumber();
        }
    }

    /**
     * Informs the user about the correct input format.
     * @param context Bot context needed for responding
     */
    async clarifyInputFormat(context){
        if(this.requiredInformation[0] === "Geburtsdatum"){
            await sendVoiceReply(context, botMessages.clarifyBirthDate);
        }else{
            await sendVoiceReply(context, botMessages.clarifyInput(this.currentInput, this.requiredInformation[0]));
        }
    }

//--------------VALIDATOR FUNCTIONS------------------------------------------------//
    checkBirthDateFormat(){
        return validator.isDate(this.currentInput);
    }

    checkPostCode(){
        return validator.isPostalCode(this.currentInput, "DE");
    }

    checkCountry(){
        countries.registerLocale(require("i18n-iso-countries/langs/de.json"));
        const countryNamesDe = countries.getNames("de");
          return Object.values(countryNamesDe).some(
            name => name.toLowerCase() === this.currentInput.trim().toLowerCase()
            );
    }

    checkMail(){
        return validator.isEmail(this.currentInput);
    }

    checkHouseNumber(){
        const houseNumberRegex = /^\d{1,4}([\-\/]?\d{1,3})?([ ]?[a-zA-Z])?$/;
        return houseNumberRegex.test(this.currentInput);
    }

    checkPhoneNumber(){
        return validator.isMobilePhone(this.currentInput, "de-DE");
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