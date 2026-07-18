import { PRIVACY_EMAIL } from "./privacyContact";

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

const EFFECTIVE_DATE = "18 de juliol de 2026";

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
        paragraphs: [
          `El responsable del tractament és la persona física que opera aquest prototip a Espanya. Per a sol·licituds de privadesa o exercici de drets, escriu a ${PRIVACY_EMAIL} (adreça provisional mentre el projecte no té un contacte definitiu).`,
        ],
      },
      {
        heading: "Quines dades recollim",
        paragraphs: [
          "En mode API, quan envies una gravació per analitzar-la, podem desar: l'arxiu d'àudio (dada personal; la veu pot permetre identificar o reconèixer una persona), la data, l'adreça IP, el User-Agent del navegador, les puntuacions del model i, si n'envies, el comentari o l'autoidentificació dialectal.",
          "En mode mock (simulació local), l'àudio no s'envia a un servidor d'aquest projecte; només es processa al teu navegador amb resultats ficticis.",
          "No demanem nom, correu electrònic ni creació de compte per utilitzar l'oracle.",
        ],
      },
      {
        heading: "Per a què les fem servir",
        paragraphs: [
          "Per retornar-te una estimació de similitud acústica amb cinc zones macrodialectals catalanes.",
          "Per millorar el model i la recerca (avaluació, calibratge i entrenament futur), sempre tractant el resultat com a similitud acústica i no com a origen geogràfic ni identitat.",
          "Per atendre sol·licituds de gestió o supressió de dades.",
        ],
      },
      {
        heading: "Base jurídica",
        paragraphs: [
          "La base principal és el teu consentiment: en utilitzar el mode API i enviar una gravació, acceptes que l'àudio i les metadades associades es desin i s'utilitzin amb les finalitats descrites aquí i als Termes d'ús (art. 6.1.a RGPD).",
          "Si no hi estàs d'acord, no enviïs gravacions al servidor (pots sortir o quedar-te en mode mock). Pots retirar el consentiment demanant la supressió de les dades ja enviades; això no afectarà la licitud del tractament anterior.",
        ],
      },
      {
        heading: "Conservació i seguretat",
        paragraphs: [
          "Conservem les gravacions i metadades mentre siguin necessàries per a les finalitats de recerca indicades o fins que atenguem una sol·licitud de supressió, llevat d'obligacions legals de conservació.",
          "Apliquem mesures tècniques i organitzatives raonables per a un prototip de recerca (accés restringit al servidor i esborrat manual per identificador). No prometem el mateix nivell de controls que un servei comercial certificat.",
        ],
      },
      {
        heading: "Encàrrecs, allotjament i transferències",
        paragraphs: [
          "No venem les teves dades personals. Podem fer servir proveïdors tècnics (allotjament, infraestructura) estrictament per operar el servei. Podem divulgar dades si la llei ho exigeix.",
          "Els models o components de tercers (per exemple, codificadors d'àudio) es poden executar al servidor per generar les puntuacions; no impliquen cedir el teu àudio amb finalitats de màrqueting.",
          "Si l'allotjament o algun proveïdor tracta dades fora de l'Espai Econòmic Europeu, ho farem només amb les garanties exigides pel RGPD (per exemple, clàusules contractuals tipus o decisions d'adequació), en la mesura que correspongui al desplegament concret.",
        ],
      },
      {
        heading: "Els teus drets",
        paragraphs: [
          "Pots exercir els drets d'accés, rectificació, supressió, limitació, portabilitat i oposició, i el dret a retirar el consentiment, quan correspongui.",
          `Fes-ho des de «Gestiona les meves dades» (hi trobaràs IP, User-Agent i IDs locals) o escrivint a ${PRIVACY_EMAIL} amb els IDs de gravació o comentari. Les sol·licituds es processen manualment.`,
          "També pots presentar una reclamació davant l'Agència Espanyola de Protecció de Dades (AEPD): https://www.aepd.es.",
        ],
      },
      {
        heading: "Menors",
        paragraphs: [
          "El servei està pensat per a persones de 18 anys o més. No recollim dades de menors de forma intencionada.",
        ],
      },
      {
        heading: "Canvis",
        paragraphs: [
          "Podem actualitzar aquesta política. La data d'entrada en vigor figura al capdamunt. L'ús continuat del servei després d'un canvi implica que has pogut revisar la versió actual.",
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
          "Has de tenir com a mínim 18 anys per utilitzar el servei.",
        ],
      },
      {
        heading: "Gravacions i llicència de recerca",
        paragraphs: [
          "En mode API, quan envies àudio per analitzar-lo, es desa al servidor amb metadades tècniques (com ara IP i User-Agent) i pot utilitzar-se per millorar models i avaluacions de recerca, d'acord amb la Política de privadesa i el RGPD/LOPDGDD.",
          "Conserves els drets sobre la teva veu; ens atorgues una llicència no exclusiva, gratuïta i mundial per emmagatzemar, processar i utilitzar aquesta gravació i el feedback associat amb finalitats de recerca i millora del prototip.",
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
        paragraphs: [
          `Per a preguntes sobre aquests termes o la privadesa: ${PRIVACY_EMAIL} (adreça provisional).`,
        ],
      },
    ],
  },
};
