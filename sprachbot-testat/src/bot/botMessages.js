/**
 * Collection of possible messages from bot to user
 */

module.exports ={
    welcomeMsg: `Guten Tag, Ich bin ein Azure-Sprachbot, entwickelt zur Erfassung von Benutzerdaten.
                Ich werde nacheinander für die Erstellung Ihres Nutzeraccounts relevante Daten
                erfassen. Sie erhalten jweils nach jeder ihrer Angaben noch die 
                Möglichkeit, diese noch zu ändern oder zu korrigieren.`,
    askForInformation: (information) => `Ich benötige von Ihnen die folgende Info: ${information}`,
    repeatInput: (input, entity) => `Ich werde ${input} für das Feld ${entity} speichern, ist das korrekt?`,
    clarifyConfirmation: "Bitte antworten Sie mit Ja oder Nein.",
    confirmSave: "Vielen Dank, Ihre Angabe wurde gespeichert.",
    internalError: "Das habe Ich leider nicht verstanden. ",
    endOfProcess: "Vielen Dank, Ihr Account wurde erstellt."
};

