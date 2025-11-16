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
        constructor() {
        super();
        this.user = new UserTO();
        this.requiredInformation = ["Vorname", "Nachname", "Geburtsdatum", "Land", "Stadt", "Straße", "Hausnummer", "Postleitzahl", "eMail", "Telefonnummer"];
        this.state = "awaitingInformation";
        this.currentInput = null;

        // Keywords for confirmation/rejection
        this.confirmationKeywords = ["ja", "das stimmt", "stimmt", "richtig", "korrekt"];
        this.rejectionKeywords = ["nein", "das stimmt nicht", "falsch", "nicht korrekt"];

        this.onMessage(async (context, next) => {
            const text = context.activity.text || "";

            // Detect intent and create entities locally
            const { topIntent, entities } = this.detectIntentAndEntities(text);
            await this.processUserMessage(topIntent, entities, context);

            await next();
        });

        // Send welcome text messages
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

    /**
     * Detects intent and generates entities
     */
    detectIntentAndEntities(text) {
        const entities = [];

        if (this.confirmationKeywords.some(word => text.includes(word))) {
            entities.push({ category: "confirm", text });
            return { topIntent: "confirmation", entities };
        }

        if (this.rejectionKeywords.some(word => text.includes(word))) {
            entities.push({ category: "reject", text });
            return { topIntent: "confirmation", entities };
        }

        // Default: entering information
        return { topIntent: "enterInformation", entities };
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
        if(validator.isDate(this.currentInput)){
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


function saveUserInput(input, category, user) {
    user[category] = input;
}

async function createUser(user){
    const dataManager = require('../data/dataManager');
    await dataManager.insertUser(user);
    await dataManager.destroyDb();
}

/**
 * Maps AWS Lex slots to expected entity array format
 * @param {*} slots Lex slots object
 * @returns entities array with { category, text } structure
 */
function mapLexSlotsToEntities(slots) {
    const entities = [];
    if (!slots) return entities;

    for (const [key, value] of Object.entries(slots)) {
        if (value && value.trim() !== '') {
            entities.push({ category: key, text: value });
        }
    }
    return entities;
}

module.exports = { EchoBot };