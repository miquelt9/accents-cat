import { CONTROLLER_NAME, PRIVACY_EMAIL, PRIVACY_EMAIL_IS_PLACEHOLDER } from "./privacyContact";

export type LegalDocId = "privacy" | "terms";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocumentContent {
  id: LegalDocId;
  eyebrow: string;
  title: string;
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
}

/** Keep in sync with backend ``DEFAULT_POLICY_VERSION`` / ``ORACLE_POLICY_VERSION``. */
export const LEGAL_POLICY_VERSION = "18 de juliol de 2026";

const EFFECTIVE_DATE = LEGAL_POLICY_VERSION;

function controllerParagraph(): string {
  const identity = CONTROLLER_NAME
    ? `${CONTROLLER_NAME}, persona física que opera aquest prototip a Espanya`
    : "la persona física que opera aquest prototip a Espanya (identitat a completar abans del llançament públic)";
  const provisional = PRIVACY_EMAIL_IS_PLACEHOLDER
    ? " (adreça provisional mentre el projecte no té un contacte definitiu)"
    : "";
  return `El responsable del tractament és ${identity}. Per a sol·licituds de privadesa o exercici de drets, escriu a ${PRIVACY_EMAIL}${provisional}.`;
}

function contactParagraph(): string {
  const provisional = PRIVACY_EMAIL_IS_PLACEHOLDER ? " (adreça provisional)" : "";
  return `Per a preguntes sobre aquests termes o la privadesa: ${PRIVACY_EMAIL}${provisional}.`;
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDocumentContent> = {
  privacy: {
    id: "privacy",
    eyebrow: "Privadesa",
    title: "Política de privadesa",
    effectiveDate: EFFECTIVE_DATE,
    intro:
      "Aquesta política descriu com l'Oracle d'accents catalans tracta les dades quan utilitzes el servei en mode API. És un prototip de recerca gestionat de forma individual des d'Espanya, no un producte comercial amb comptes d'usuari. El tractament se subjecta al Reglament general de protecció de dades (RGPD) i a la Llei Orgànica 3/2018 (LOPDGDD), en la mesura que resultin aplicables.",
    sections: [
      {
        heading: "Responsable del tractament",
        paragraphs: [controllerParagraph()],
      },
      {
        heading: "Quines dades recollim",
        paragraphs: [
          "En mode API, quan envies una gravació per analitzar-la, el servidor la processa temporalment per calcular les puntuacions. Pots donar el consentiment per desar-la per a recerca de dues maneres: (a) abans d'enregistrar, mitjançant una casella a la pantalla inicial; o (b) després de veure el resultat, en un flux progressiu que pot incloure una pregunta de feedback abans de l'opció de desament.",
          "Si acceptes el desament per a recerca (per qualsevol d'aquestes vies), podem conservar: l'arxiu d'àudio (dada personal; la veu pot permetre identificar o reconèixer una persona), la data, l'adreça IP, el User-Agent del navegador, les puntuacions del model, la versió de la política acceptada i les metadades de feedback associades a la gravació mitjançant un identificador de gravació. L'IP es conserva juntament amb l'àudio per a la recerca (incloent-hi una localització aproximada i gruixuda derivada de l'IP, no una adreça precisa ni el lloc de naixement).",
          "Al flux de resultats, pots indicar si consideres que l'estimació ha encertat o no, i —si indiques que no l'hem encertat— la zona macrodialectal amb què t'autoidentifiques (balear, central, septentrional, nord-occidental, valencià, mixt o desconegut). Aquesta informació serveix per calibrar el model i es tracta com a similitud acústica amb una zona dialectal, no com a prova d'origen geogràfic ni de residència. També pots afegir un comentari opcional.",
          "Si no acceptes el desament per a recerca, esborrem l'àudio pendent immediatament quan ho indiquis explícitament a la pantalla de resultats (o en sortir sense haver optat per desar-la), i esborrem també l'IP i el User-Agent d'aquella fila. Les respostes de feedback que hagis enviat es poden conservar sense enllaç a la gravació (sense identificador de gravació) per a calibratge agregat del model; no utilitzem l'àudio per a entrenament.",
          "En mode mock (simulació local), l'àudio no s'envia a un servidor d'aquest projecte; només es processa al teu navegador amb resultats ficticis.",
          "No demanem nom, correu electrònic ni creació de compte per utilitzar l'oracle. El tractament amb consentiment de recerca és pseudònim (identificador de gravació), no anònim.",
        ],
      },
      {
        heading: "Per a què les fem servir",
        paragraphs: [
          "Per retornar-te una estimació de similitud acústica amb cinc zones macrodialectals catalanes (tractament transitori necessari per prestar el servei que demanes).",
          "Al flux de resultats, per calibrar el model amb les teves respostes sobre l'encert de l'estimació i, si escau, la zona macrodialectal autoinformada, sempre com a similitud acústica i no com a origen geogràfic ni identitat.",
          "Només si ho acceptes explícitament (a la pantalla inicial o al flux de resultats): per emmagatzemar l'àudio, l'IP, el User-Agent i metadades associades per a recerca i entrenament futur del prototip, incloent-hi l'ús de l'IP per inferir una localització aproximada (gruixuda) que ajudi a contextualitzar el corpus geogràficament. Això no equival a determinar el teu lloc de naixement ni la teva identitat dialectal personal.",
          "Per atendre sol·licituds de gestió o supressió de dades.",
        ],
      },
      {
        heading: "Base jurídica",
        paragraphs: [
          "L'anàlisi puntual (sense desament per a entrenament) es fa per prestar el servei que sol·licites en enviar la gravació (art. 6.1.b RGPD) i, quan correspongui, amb el teu consentiment a utilitzar el prototip.",
          "El desament de l'àudio, l'IP i metadades per a recerca i entrenament (incloent-hi la localització aproximada derivada de l'IP) es basa en el teu consentiment explícit i específic (art. 6.1.a RGPD), mitjançant la casella de la pantalla inicial o l'opció de desament del flux progressiu de resultats (després del feedback, si escau). Pots retirar-lo demanant la supressió; això no afectarà la licitud del tractament anterior.",
          "Les respostes de feedback dialectal al flux de resultats (encert i correcció de zona macrodialectal) es basen en el teu consentiment explícit en participar-hi (art. 6.1.a RGPD). Si també acceptes el desament de l'àudio, el feedback queda associat a la gravació mitjançant l'identificador de gravació.",
        ],
      },
      {
        heading: "Conservació i seguretat",
        paragraphs: [
          "Les gravacions pendents de consentiment es guarden temporalment al servidor mentre decideixes. Si rebutges explícitament el desament a la pantalla de resultats, o surts sense haver optat per desar-la, esborrem l'àudio immediatament de l'emmagatzematge temporal i esborrem l'IP i el User-Agent d'aquella fila.",
          "Si abandones la sessió sense prendre una decisió, l'àudio pendent s'esborra automàticament al cap d'un termini curt (per defecte fins a 30 minuts). Aquesta finestra només és una mesura de seguretat per a sessions abandonades, no un període de retenció actiu.",
          "Si acceptes la recerca, conservem l'àudio, l'IP i metadades mentre el prototip de recerca estigui actiu, amb un màxim de 3 anys des del consentiment, o fins que atenguem una sol·licitud de supressió, llevat d'obligacions legals de conservació. Passat aquest termini, es poden esborrar amb l'eina d'operador de retenció.",
          "Apliquem mesures tècniques i organitzatives raonables per a un prototip de recerca (accés restringit al servidor i esborrat manual per identificador). No prometem el mateix nivell de controls que un servei comercial certificat.",
        ],
      },
      {
        heading: "Encàrrecs, allotjament i transferències",
        paragraphs: [
          "No venem les teves dades personals. El tractament i l'allotjament del servei es fan a Espanya / dins de l'Espai Econòmic Europeu. Podem fer servir proveïdors tècnics (allotjament, infraestructura) estrictament per operar el servei. Podem divulgar dades si la llei ho exigeix.",
          "Els models o components de tercers (per exemple, codificadors d'àudio) s'executen al servidor a Espanya per generar les puntuacions; no impliquen cedir el teu àudio amb finalitats de màrqueting.",
        ],
      },
      {
        heading: "Els teus drets",
        paragraphs: [
          "Pots exercir els drets d'accés, rectificació, supressió, limitació, portabilitat i oposició, i el dret a retirar el consentiment, quan correspongui.",
          `Fes-ho des de «Gestiona les meves dades» (hi trobaràs IP, User-Agent i IDs locals de gravacions que has acceptat desar) o escrivint a ${PRIVACY_EMAIL} amb els IDs de gravació o comentari. Les sol·licituds es processen manualment, normalment en un termini de 30 dies.`,
          "També pots presentar una reclamació davant l'Agència Espanyola de Protecció de Dades (AEPD): https://www.aepd.es.",
        ],
      },
      {
        heading: "Menors",
        paragraphs: [
          "El servei està pensat per a persones de 18 anys o més. Per desar una gravació per a recerca cal confirmar l'edat, ja sigui a la casella de la pantalla inicial o en el flux de resultats. No recollim dades de menors de forma intencionada.",
        ],
      },
      {
        heading: "Canvis",
        paragraphs: [
          "Podem actualitzar aquesta política. La data d'entrada en vigor figura al capdamunt. L'ús continuat del servei després d'un canvi implica que has pogut revisar la versió actual; el consentiment de recerca es demana de nou per a cada gravació que vulguis desar, tant si optes a la pantalla inicial com al flux de resultats.",
        ],
      },
    ],
  },
  terms: {
    id: "terms",
    eyebrow: "Termes",
    title: "Termes d'ús",
    effectiveDate: EFFECTIVE_DATE,
    intro:
      "Aquests termes regeixen l'ús de l'Oracle d'accents catalans, un prototip de recerca operat des d'Espanya que estima la similitud acústica d'una lectura en veu alta amb zones dialectals catalanes. Si no hi estàs d'acord, no utilitzis el servei.",
    sections: [
      {
        heading: "Naturalesa del servei",
        paragraphs: [
          "El resultat és una estimació de similitud acústica amb cinc macros zones dialectals. No és una prova d'origen geogràfic, de residència, de nacionalitat ni d'identitat personal.",
          "El model pot equivocar-se; la confiança pot ser limitada. El servei es proporciona «tal com és», sense garantia de precisió, disponibilitat contínua ni idoneïtat per a cap ús concret.",
        ],
      },
      {
        heading: "Edat",
        paragraphs: [
          "Has de tenir com a mínim 18 anys per utilitzar el servei. El desament per a recerca requereix una confirmació explícita d'edat, ja sigui mitjançant la casella de la pantalla inicial o en el flux de resultats.",
        ],
      },
      {
        heading: "Gravacions i llicència de recerca",
        paragraphs: [
          "En mode API, l'àudio s'envia al servidor a Espanya per analitzar-lo. El desament durable per a recerca i entrenament només es fa si ho acceptes explícitament: mitjançant la casella de la pantalla inicial abans d'enregistrar, o mitjançant l'opció de desament del flux progressiu de resultats (després del feedback, si escau), d'acord amb la Política de privadesa i el RGPD/LOPDGDD.",
          "Si acceptes, conserves els drets sobre la teva veu i ens atorgues una llicència no exclusiva, gratuïta i mundial per emmagatzemar, processar i utilitzar aquesta gravació, l'adreça IP associada (incloent-hi una localització aproximada derivada de l'IP) i el feedback dialectal associat (incloent-hi correccions de zona macrodialectal i comentaris opcionals) amb finalitats de recerca i millora del prototip, incloent-hi l'entrenament i la publicació de models o embeddings derivats de codi obert. No venem l'àudio en brut. No publiquem l'àudio original sense una decisió addicional i avís.",
          "Pots demanar la supressió seguint el procediment de «Gestiona les meves dades».",
        ],
      },
      {
        heading: "Ús acceptable",
        paragraphs: [
          "No utilitzis el servei per activitats il·legals, per abusar de la infraestructura (atacs, saturació deliberada, extracció massiva automatitzada), ni per suplantar tercers.",
          "No presentis els resultats de l'oracle com a prova jurídica, mèdica, laboral o d'identitat.",
        ],
      },
      {
        heading: "Propietat intel·lectual",
        paragraphs: [
          "El codi, el disseny, els textos de l'interfície i els actius del prototip pertanyen als seus autors o llicenciants. Se't concedeix un dret limitat d'ús personal no comercial del servei tal com s'ofereix.",
        ],
      },
      {
        heading: "Limitació de responsabilitat",
        paragraphs: [
          "En la mesura permesa per la llei espanyola aplicable, el responsable del prototip no respon de danys indirectes, pèrdua de dades, interrupcions del servei ni decisions que prenguis basant-te en les puntuacions del model.",
          "El servei pot limitar-se o deixar d'estar disponible en qualsevol moment (per saturació, manteniment o tancament del prototip).",
        ],
      },
      {
        heading: "Privadesa",
        paragraphs: [
          "El tractament de dades es descriu a la Política de privadesa, que forma part d'aquests termes.",
        ],
      },
      {
        heading: "Llei i jurisdicció",
        paragraphs: [
          "Aquests termes es regeixen per la legislació espanyola. Per a qualsevol controvèrsia, les parts se sotmeten als jutjats i tribunals del domicili del responsable a Espanya, llevat que una norma imperativa disposi una altra cosa (per exemple, normes de protecció de persones consumidores).",
          "Si alguna clàusula no fos vàlida, la resta continuarà vigent.",
        ],
      },
      {
        heading: "Contacte",
        paragraphs: [contactParagraph()],
      },
    ],
  },
};
