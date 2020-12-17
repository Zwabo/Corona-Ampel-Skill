/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
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

async function getDefaultPlz(handlerInput){
    const attributesManager = handlerInput.attributesManager;
    const attributes = await attributesManager.getPersistentAttributes() || {};
    return attributes.default_plz;
}

function getWarnstufenColor(warnstufe){
    let warnstufenArr = ["grün", "gelb", "orange", "rot"];
    return warnstufenArr[warnstufe - 1];
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        let speakOutput = 'Hallo! Um den aktuellen Corona-Ampel Status abzurufen, sag einfach: "Zeig mir den aktuellen Corona Status".';
        
       const attr = await getDefaultPlz(handlerInput);
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
    const defaultPlz = await getDefaultPlz(handlerInput);
    
    if(!plz.value){
        plz.value = defaultPlz;
    }
    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};

const InProgressGetCoronaAmpelStatusIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetCoronaAmpelStatusIntent'
        && handlerInput.requestEnvelope.request.dialogState === 'IN_PROGRESS';
  },
  handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;
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
        let plzString = plzArr[0] + " " + plzArr[1] + " " + plzArr[2] + " " + plzArr[3];

        //Setting the speech output
        let speakOutput = "Bitte setze eine Standard-Postleitzahl oder sag mir für welche Postleitzahl ich dir den Status sagen soll.";
        if(plz !== 0){
            let result = await axios.get('https://nwh99aug3j.execute-api.us-east-1.amazonaws.com/status/' + plz);
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

const YesIntentWarnstufenInfoHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent'
            && handlerInput.attributesManager.getSessionAttributes().questionAsked === 'WarnstufenInfo';
    },
    handle(handlerInput) {
        setQuestion(handlerInput, 'WarnstufenInfo'); //Reset Question
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
        const speakOutput = `Die Postleitzahl lautet ${plz}. Ist das richtig?`;
        
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
        let plz = handlerInput.requestEnvelope.request.intent.slots.PLZ.value;
        if(plz % 1 !== 0){
            plz = plz * 100;
            Math.floor(plz);
        }
        const attributesManager = handlerInput.attributesManager;
        let attributes = { "default_plz": plz };

        attributesManager.setPersistentAttributes(attributes);
        await attributesManager.savePersistentAttributes();
        
        let speakOutput = `Die gespeicherte Postleitzahl lautet: ${attributes.default_plz}. Der Name lautet: ${handlerInput.requestEnvelope.request.intent.slots.Name.value}`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

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
        const speakOutput = 'Goodbye!';

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
        InProgressGetCoronaAmpelStatusIntentHandler,
        GetCoronaAmpelStatusIntentHandler,
        YesIntentWarnstufenInfoHandler,
        NoIntentWarnstufenInfoHandler,
        SetDefaultPLZsConfirmNameIntentHandler,
        SetDefaultPLZsIntentHandler,
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