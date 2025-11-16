const { ActivityHandler, MessageFactory } = require('botbuilder');
const messages = require('./botMessages');
const UserTO = require('../data/UserTO');
const botMessages = require('./botMessages');
const validator = require('validator');
const countries = require("i18n-iso-countries");
const { DateTime } = require("luxon");

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
            const text = context.activity.text || "";

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

        //Send welcome text messages
        this.onMembersAdded(async (context, next) => {
            for (const member of context.activity.membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    await context.sendActivity(messages.welcomeMsg);
                    await this.askForInformation(context);
                }
            }
            await next();
        });
    }

    async processUserMessage(topIntent, entities, context) {
        switch (topIntent) {
            case "enterInformation":
                await this.processInformation(entities, context);
                break;

            case "confirmation":
                await this.handleConfirm(entities, context);
                break;

            default:
                await context.sendActivity(messages.internalError);
                this.askForInformation(context);
                break;
        }
    }

    async processInformation(entities, context) {
        if (this.state !== "awaitingInformation") {
            await context.sendActivity(messages.clarifyConfirmation);
            return;
        }
        await this.verifyInput(entities, context);
    }

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
            await context.sendActivity(messages.confirmSave);
            await this.askForInformation(context);
        } else if (rejected) {
            await this.askForInformation(context);
        } else {
            await context.sendActivity(messages.clarifyConfirmation);
        }
    }

    async verifyInput(entities, context) {
        let currentInformation = this.requiredInformation[0];
        let relevantInformation = currentInformation;
        
        if(currentInformation === "Nachname" || currentInformation === "Vorname"){
            relevantInformation = "Name";
        }

        const entityValue = extractEntityValue(entities, relevantInformation, context);

        this.currentInput = entityValue;
        if(this.verifyInputFormat()){
            this.state = "awaitingConfirmation";
            await context.sendActivity(messages.repeatInput(entityValue, currentInformation));
        } else {
           await this.clarifyInputFormat(context);
        }
    }

    async askForInformation(context) {
        if (this.requiredInformation.length === 0) {
            await context.sendActivity(messages.endOfProcess);
            createUser(this.user);
            return;
        }

        const currentInformation = this.requiredInformation[0];
        this.state = "awaitingInformation";
        await context.sendActivity(messages.askForInformation(currentInformation));
    }

    verifyInputFormat(){
        switch(this.requiredInformation[0]){
            case "Vorname":
            case "Nachname":
            case "Stadt":
            case "Straße":
                return true;
            
            case "Geburtsdatum":
                return this.checkBirthDateFormat();
            
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

    async clarifyInputFormat(context){
        if(this.requiredInformation[0] === "Geburtsdatum"){
            await context.sendActivity(botMessages.clarifyBirthDate);
        }else{
            await context.sendActivity(botMessages.clarifyInput(this.currentInput, this.requiredInformation[0]));
        }
    }

    checkBirthDateFormat(){
        const parsedDate = parseBirthDateFromLangauageInput(this.currentInput);
        if(validator.isDate(parsedDate)){
            this.currentInput = parsedDate;
            return true;
        }else{
            return false;
        }
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

function extractEntityValue(entities, category, context) {
    const entity = entities.find(e => e.category === category);
    return entity ? entity.text : context.activity.text;
}

function parseBirthDateFromLangauageInput(inputDate){
    const parsedDate = DateTime.fromFormat(inputDate, "d. MMMM yyyy", { locale: "de" });
    return parsedDate.isValid ? parsedDate.toISODate() : null;
}

function saveUserInput(input, category, user) {
    user[category] = input;
}

async function createUser(user){
    const dataManager = require('../data/dataManager');
    await dataManager.insertUser(user);
    await dataManager.destroyDb();
}

module.exports = { EchoBot };