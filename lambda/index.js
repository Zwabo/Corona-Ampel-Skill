const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const axios = require('axios');

function setQuestion(handlerInput, questionAsked) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  sessionAttributes.questionAsked = questionAsked;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
}

function setSessionWarnstufe(handlerInput, warnstufe) {
  const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
  sessionAttributes.warnstufe = warnstufe;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
}

function setSingleSessionAttribute(handlerInput, content, type) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    
    switch(type){
        case 'questionAsked':
            sessionAttributes.questionAsked = content;
            break;
        case 'warnstufe':
            sessionAttributes.warnstufe = content;
            break;
        case 'defaultPlz':
            sessionAttributes.defaultPlz = content;
            break;
    }
    
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
}

async function updatePersistentAttributes(handlerInput, entry) {
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes() || {"default_plzs": []};
    return attributes.default_plzs;
}

async function getDefaultPlzs(handlerInput) {
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes() || {};
    return attributes.default_plzs;
}

async function addDefaultPlz(handlerInput, entry) {
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes() || {};
    console.log("openend!");
    
    if(!attributes.default_plzs) {
        console.log("In the if!");
        attributesManager.setPersistentAttributes({ "default_plzs": [entry] });
        await attributesManager.savePersistentAttributes();
        console.log("saved it!");
        return;
    }
    
    let defaultPlzs = attributes.default_plzs;
    defaultPlzs.push(entry);
    
    attributesManager.setPersistentAttributes(attributes);
    await attributesManager.savePersistentAttributes();
}

async function overwriteDefaultPlz(handlerInput, entry, oldEntryName) {
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes() || {};
    
    let defaultPlzs = attributes.default_plzs;
    
    //Find entry to be overwritten and put new entry in its index
    let i = defaultPlzs.findIndex(entry => entry.name === oldEntryName);
    
    if(i === -1){
        throw new Error('Es existiert kein Eintrag mit diesem Namen!');
    }
    
    defaultPlzs[i] = entry;
    
    attributesManager.setPersistentAttributes(attributes);
    await attributesManager.savePersistentAttributes();
}

function getWarnstufenColor(warnstufe) {
    let warnstufenArr = ["grün", "gelb", "orange", "rot"];
    return warnstufenArr[warnstufe - 1];
}

function stringifyPlz(plz) {
        //Creating array of single PLZ-digits
        let plzArr = [];
        for (let i = 0, len = plz.length; i < len; i += 1) {
            plzArr.push(+plz.charAt(i));
        }
        let plzString = plzArr[0] + " " + plzArr[1] + " " + plzArr[2] + " " + plzArr[3]; //Seperate single plz digits
        return plzString;
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        let speakOutput = 'Hallo! Um den aktuellen Corona-Ampel Status abzurufen, sag einfach: "Zeig mir den aktuellen Corona Status".';
        
       const attr = await getDefaultPlzs(handlerInput);
        if(!attr){
            speakOutput += 'Willst du eine Standard-Postleitzahl setzen, damit ich immer weiß für welchen Ort ich den Ampel-Status abrufen soll?';
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const StartedGetCoronaAmpelStatusIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCoronaAmpelStatusIntent'
        && handlerInput.requestEnvelope.request.dialogState === 'STARTED';
  },
  async handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    let plz = currentIntent.slots.PLZ;
    
    if(plz.value % 1 !== 0){
        plz.value = plz.value * 100;
        Math.floor(plz.value);
    }
    
    if(!plz.value){
        const defaultPlzs = await getDefaultPlzs(handlerInput);
        
        if(defaultPlzs.length > 1){
            return handlerInput.responseBuilder
                .speak('Du hast mehrere Postleitzahlen hinterlegt. Bitte sag mir den Namen den du einer der Postleitzahlen gegeben hast.')
                .addElicitSlotDirective('name')
                .getResponse();
        }
        else{
            plz.value = defaultPlzs[0].plz;
        }
    }
    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};

/**
const StartedInProgressMultiplePlzsGetCoronaAmpelStatusIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCoronaAmpelStatusIntent'
        && handlerInput.requestEnvelope.request.dialogState === 'IN_PROGRESS'
        && handlerInput.requestEnvelope.request.intent.slots.name.value
        && !handlerInput.requestEnvelope.request.intent.slots.plz.value;
  },
  async handle(handlerInput) {
      console.log("right called!!");
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const defaultPlzs = await getDefaultPlzs(handlerInput);
    
    let foundElem = defaultPlzs.find(elem => elem.name === currentIntent.slots.name.value);
    currentIntent.slots.plz.value = foundElem.plz; //Set slot plz value to found elem plz 
    
    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};
**/

const InProgressGetCoronaAmpelStatusIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCoronaAmpelStatusIntent'
        && handlerInput.requestEnvelope.request.dialogState === 'IN_PROGRESS'
  },
  async handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    console.log("openend!")
    
    if(handlerInput.requestEnvelope.request.intent.slots.name.value && !handlerInput.requestEnvelope.request.intent.slots.PLZ.value){
        console.log("If also opened!")
        const defaultPlzs = await getDefaultPlzs(handlerInput);
        let foundElem = defaultPlzs.find(elem => elem.name === currentIntent.slots.name.value);
        if(foundElem) currentIntent.slots.PLZ.value = foundElem.plz; //Set slot plz value to found elem plz
        //Elicit name-slot again, if the name said by the user doesn't exist
        else {
            return handlerInput.responseBuilder
                .speak('Du hast keine Postleitzahl mit diesem Namen hinterlegt. Sag mir einen Namen, den du hinterlegt hast.')
                .addElicitSlotDirective('name')
                .getResponse();
        }
    }
    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};

const GetCoronaAmpelStatusIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCoronaAmpelStatusIntent'
            && handlerInput.requestEnvelope.request.dialogState === 'COMPLETED';
    },
    async handle(handlerInput) {
        let intentPlz = handlerInput.requestEnvelope.request.intent.slots.PLZ.value;
        
        //Setting PLZ either to default_plz stored in the db or the intent plz
        let plz = 0;
        if(intentPlz !== null) plz = intentPlz.toString();
        
        //Creating array of single PLZ-digits
        let plzArr = [];
        for (let i = 0, len = plz.length; i < len; i += 1) {
            plzArr.push(+plz.charAt(i));
        }
        let plzString = stringifyPlz(plz); //Seperate single plz digits

        //Setting the speech output
        let speakOutput = "Bitte setze eine Standard-Postleitzahl oder sag mir für welche Postleitzahl ich dir den Status sagen soll.";
        if(plz !== 0){
            let result = await axios.get('https://mpg9pvi8j0.execute-api.us-east-1.amazonaws.com/status/' + plz);
            let warnstufe = getWarnstufenColor(result.data.Warnstufe);
            speakOutput = "Für die Postleitzahl " + plzString + " steht die Corona-Ampel auf " + warnstufe + '. ';
            setSessionWarnstufe(handlerInput, result.data.Warnstufe); //Set Warnstufe as session attribute
        }
        setQuestion(handlerInput, 'WarnstufenInfo'); //Set Question

        return handlerInput.responseBuilder
            .speak(speakOutput + 'Willst du Infos zu deiner Corona-Warnstufe?')
            .reprompt('Benötigst du Infos zur Corona Warnstufe?')
            .getResponse();
    }
};

const StartedGetCasesIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCasesIntent'
          && handlerInput.requestEnvelope.request.dialogState === 'STARTED';
    },
    async handle(handlerInput) {
      const currentIntent = handlerInput.requestEnvelope.request.intent;
      let plz = currentIntent.slots.plz;
      
      if(plz.value % 1 !== 0){
          plz.value = plz.value * 100;
          Math.floor(plz.value);
      }
      console.log(plz.value);
      
      if(!plz.value){
          const defaultPlzs = await getDefaultPlzs(handlerInput);
          
          if(defaultPlzs.length > 1){
              return handlerInput.responseBuilder
                  .speak('Du hast mehrere Postleitzahlen hinterlegt. Bitte sag mir den Namen den du einer der Postleitzahlen gegeben hast.')
                  .addElicitSlotDirective('name')
                  .getResponse();
          }
          else{
              plz.value = defaultPlzs[0].plz;
          }
      }
      return handlerInput.responseBuilder
        .addDelegateDirective(currentIntent)
        .addElicitSlotDirective('plz')
        .getResponse();
    },
  };

const InProgressGetCasesIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCasesIntent'
          && handlerInput.requestEnvelope.request.dialogState === 'IN_PROGRESS'
    },
    async handle(handlerInput) {
        const currentIntent = handlerInput.requestEnvelope.request.intent;
        console.log("openend!")
        
        if(handlerInput.requestEnvelope.request.intent.slots.name.value && !handlerInput.requestEnvelope.request.intent.slots.plz.value){
            console.log("If also opened!")
            const defaultPlzs = await getDefaultPlzs(handlerInput);
            let foundElem = defaultPlzs.find(elem => elem.name === currentIntent.slots.name.value);
            if(foundElem) currentIntent.slots.plz.value = foundElem.plz; //Set slot plz value to found elem plz
            //Elicit name-slot again, if the name said by the user doesn't exist
            else {
                return handlerInput.responseBuilder
                    .speak('Du hast keine Postleitzahl mit diesem Namen hinterlegt. Sag mir einen Namen, den du hinterlegt hast.')
                    .addElicitSlotDirective('name')
                    .getResponse();
            }
        }
        return handlerInput.responseBuilder
          .addDelegateDirective(currentIntent)
          .getResponse();
      },
  };

const GetCasesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCasesIntent'
            && handlerInput.requestEnvelope.request.dialogState === 'COMPLETED';
    },
    async handle(handlerInput) {
        let intentPlz = handlerInput.requestEnvelope.request.intent.slots.plz.value;
        
        //Setting PLZ either to default_plz stored in the db or the intent plz
        let plz = 0;
        if(intentPlz !== null) plz = intentPlz.toString();
        
        //Creating array of single PLZ-digits
        let plzArr = [];
        for (let i = 0, len = plz.length; i < len; i += 1) {
            plzArr.push(+plz.charAt(i));
        }
        let plzString = stringifyPlz(plz); //Seperate single plz digits

        //Setting the speech output
        let speakOutput = "Bitte setze eine Standard-Postleitzahl oder sag mir für welche Postleitzahl ich dir den Status sagen soll.";
        if(plz !== 0){
            console.log("before dings");
            let result = await axios.get('https://mpg9pvi8j0.execute-api.us-east-1.amazonaws.com/cases/' + plz);
            let warnstufe = getWarnstufenColor(result.data.Warnstufe);
            console.log("after dings");
            speakOutput = "Im Bezirk " + result.data.bezirk + " hat es bisher " + result.data.anzahl + 
            " Fälle gegeben." + " Insgesamt sind " + result.data.anzahlTot + " an Covid19 verstorben." +
            " In den letzten 7 Tagen hat es " + result.data.anzahl7Tage + " Neuinfektionen in diesem Bezirk gegeben.";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const YesIntentWarnstufenInfoHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent'
            && handlerInput.attributesManager.getSessionAttributes().questionAsked === 'WarnstufenInfo';
    },
    handle(handlerInput) {
        setQuestion(handlerInput, ''); //Reset Question
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const warnstufe = sessionAttributes.warnstufe;
        
        let speakOutput = 'Warnstufe' + warnstufe;
        switch(Number(warnstufe)){
            case 1:
                speakOutput = 'Ampelfarbe grün: Es herrscht geringes Risiko. Es gibt nur einzelne Fälle und isolierte Cluster.';
                break;
            case 2:
                speakOutput = 'Ampelfarbe gelb: Es herrscht mittleres Risiko. Es gibt nur moderate Fälle, die primär in Clustern auftreten.';
                break;
            case 3:
                speakOutput = 'Ampelfarbe orange: Es herrscht hohes Risiko. Es liegt eine Häufung von Fällen vor, die nicht mehr überwiegend Clustern zuordenbar sind.';
                break;
            case 4:
                speakOutput = 'Ampelfarbe rot: Es herrscht sehr hohes Risiko. Ausbrüche sind unkontrolliert, die Verbreitung ist großflächig.';
                break;
        }
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
}

const NoIntentWarnstufenInfoHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent'
            && handlerInput.attributesManager.getSessionAttributes().questionAsked === 'WarnstufenInfo';
    },
    handle(handlerInput) {
        setQuestion(handlerInput, 'WarnstufenInfo'); //Reset Question
        const speakOutput = "Ok."
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
}

const SetDefaultPLZsConfirmNameIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetDefaultPLZsIntent'
            && Alexa.getSlot(handlerInput.requestEnvelope, 'PLZ').confirmationStatus === 'NONE';
    },
    async handle(handlerInput) {
        
        //Get PLZ
        let plz = handlerInput.requestEnvelope.request.intent.slots.PLZ.value;
        if(plz % 1 !== 0){
            plz = plz * 100;
            Math.floor(plz);
        }
        let plzString = stringifyPlz(plz);
        const speakOutput = `Die Postleitzahl lautet ${plzString}. Ist das richtig?`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .addConfirmSlotDirective('PLZ')
            .getResponse();
    }
};

const SetDefaultPLZsIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SetDefaultPLZsIntent';
    },
    async handle(handlerInput) {
        
        //Get PLZ
        let slots = handlerInput.requestEnvelope.request.intent.slots;
        let plz = slots.PLZ.value;
        if(plz % 1 !== 0){
            plz = plz * 100;
            Math.floor(plz);
        }
        let name = slots.Name.value;
        let entry = {"name": name, "plz": plz};
        
        /**
        const attributesManager = handlerInput.attributesManager;
        let attributes = { "default_plzs": [entry] };

        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();
        **/
        console.log("before");
        let defaultPlzs = await getDefaultPlzs(handlerInput);
        console.log("after");
        if(defaultPlzs && defaultPlzs.length > 0){
            setQuestion(handlerInput, 'OverwritePlz'); //Set session attribute question
            setSingleSessionAttribute(handlerInput, entry, 'defaultPlz');
            
            let speakOutput = ' Willst du einen bestehenden Eintrag überschreiben?'
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(speakOutput)
                .getResponse();
        }
        console.log("after first if");
        await addDefaultPlz(handlerInput, entry);
        let speakOutput = `Die gespeicherte Postleitzahl lautet: ${entry.plz}. Der Name lautet: ${entry.name}`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const YesIntentOverwritePlzHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent'
            && handlerInput.attributesManager.getSessionAttributes().questionAsked === 'OverwritePlz';
    },
    handle(handlerInput) {
        setQuestion(handlerInput, ''); //Reset Question
        
        const defaultPlz = handlerInput.attributesManager.getSessionAttributes().defaultPlz;
        let speakOutput = "";
        return handlerInput.responseBuilder
            .addDelegateDirective({
                name: 'OverwriteDefaultPlzIntent',
                confirmationStatus: 'NONE',
                slots: {}
            })
            .speak(speakOutput)
            .getResponse();
    }
}

const NoIntentOverwritePlzHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent'
            && handlerInput.attributesManager.getSessionAttributes().questionAsked === 'OverwritePlz';
    },
    async handle(handlerInput) {
        setQuestion(handlerInput, ''); //Reset Question
        let entry = handlerInput.attributesManager.getSessionAttributes().defaultPlz; //Entry that should be placed
        await addDefaultPlz(handlerInput, entry);
        
        let speakOutput = `Der Eintrag "${entry.name}" mit der Postleitzahl ${stringifyPlz(entry.plz)} wurde gespeichert!`
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
}

const OverwriteDefaultPlzIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'OverwriteDefaultPlzIntent'
            && handlerInput.requestEnvelope.request.dialogState === 'COMPLETED';
    },
    async handle(handlerInput) {
        try {
            let speakOutput = "";
            setQuestion(handlerInput, ''); //Reset Question
            
            let oldEntryName = handlerInput.requestEnvelope.request.intent.slots.name.value; //Name of the entry that should be overwritten
            let entry = handlerInput.attributesManager.getSessionAttributes().defaultPlz; //Entry that should be placed
            await overwriteDefaultPlz(handlerInput, entry, oldEntryName); //Overwriting old entry with new one
            
            speakOutput = `Der Eintrag "${oldEntryName}"" wurde überschrieben mit dem Eintrag "${entry.name}" mit der Postleitzahl ${stringifyPlz(entry.plz)}`
            
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
        }
        catch(e) {
            let speakOutput = `${e.message} Bitte nenne einen Namen der existiert.`;
            handlerInput.requestEnvelope.request.intent.slots.name.value = undefined;
            
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .addElicitSlotDirective('name')
            .getResponse();
        }
    }
}

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Du kannst den aktuellen Corona Ampel Status abfragen. Frage mich einfach danach';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Bis zum nächsten mal!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry, I had trouble doing what you asked. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        StartedGetCoronaAmpelStatusIntentHandler,
        //StartedInProgressMultiplePlzsGetCoronaAmpelStatusIntentHandler,
        InProgressGetCoronaAmpelStatusIntentHandler,
        GetCoronaAmpelStatusIntentHandler,
        StartedGetCasesIntentHandler,
        InProgressGetCasesIntentHandler,
        GetCasesIntentHandler,
        YesIntentWarnstufenInfoHandler,
        NoIntentWarnstufenInfoHandler,
        SetDefaultPLZsConfirmNameIntentHandler,
        SetDefaultPLZsIntentHandler,
        YesIntentOverwritePlzHandler,
        NoIntentOverwritePlzHandler,
        OverwriteDefaultPlzIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({ apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION })
        })
    )
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();