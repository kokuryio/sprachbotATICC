/**
 * TO that contains user data
 */
class UserTO {
  constructor({
    Vorname = "",
    Nachname = "",
    Geburtsdatum = "",
    Land = "",
    Stadt = "",
    Straße = "",
    Hausnummer = "",
    Postleitzahl = "",
    eMail = "",
    Telefonnummer = ""
  } = {}) { 
    this.Vorname = Vorname;
    this.Nachname = Nachname;
    this.Geburtsdatum = Geburtsdatum;
    this.Land = Land;
    this.Stadt = Stadt;
    this.Straße = Straße;
    this.Hausnummer = Hausnummer;
    this.Postleitzahl = Postleitzahl;
    this.eMail = eMail;
    this.Telefonnummer = Telefonnummer;
    this.Erstellungsdatum = new Date().toISOString();
  }
      toString() {
        return `${this.Vorname}, ${this.Erstellungsdatum}, ${this.Geburtsdatum}, ${this.eMail},  ${this.Nachname}, ${this.Telefonnummer}, ${this.Straße} ${this.Hausnummer}, ${this.Postleitzahl} ${this.Stadt}, ${this.Land}`;
    }
}

module.exports = UserTO;
