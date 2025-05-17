const { ActivityHandler, MessageFactory } = require('botbuilder');

/**
 * Contains the bots conversational logic.
 */
class EchoBot extends ActivityHandler {
    constructor(cluClient) {
        super();
        this.cluClient = cluClient;

        this.onMessage(async (context, next) => {
            const text = context.activity.text;

            const result = await this.cluClient.analyzeConversation({
                kind: "Conversation",
                analysisInput: {
                    conversationItem: {
                        id: "1",
                        participantId: "user",
                        text: text
                    },
                    modality: "text",
                    language: "en"
                },
                parameters: {
                    projectName: process.env.CLU_PROJECT_NAME,
                    deploymentName: process.env.CLU_DEPLOYMENT_NAME,
                    stringIndexType: "Utf16CodeUnit"
                }
            });

            const topIntent = result.result.prediction.topIntent;
            const entities = result.result.prediction.entities;

            if (topIntent === "CreateAccount") {
                await context.sendActivity("Great! Let's start creating your account.");
                // Optionally ask for name, address, birthdate...
            } else {
                await context.sendActivity(`I understood: "${topIntent}" but I can't help with that yet.`);
            }

            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const welcomeText = 'Hello! How can I help you today?';
            for (const member of context.activity.membersAdded) {
                if (member.id !== context.activity.recipient.id) {
                    await context.sendActivity(welcomeText);
                }
            }
            await next();
        });
    }
}

module.exports = { EchoBot };