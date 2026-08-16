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
export const LEGAL_POLICY_VERSION = "15 d'agost de 2026";

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
      "Aquesta política descriu com l'Oracle d'accents catalans tracta les dades quan utilitzes el servei en mode API. És un prototip de recerca gestionat de forma individual des d'Espanya, no un producte comercial amb comptes d'usuari. El tractament se subjecta al Reglament general de protecció de dades (RGPD) i a la Llei Orgànica 3/2018 (LOPDGDD), en la mesura que resultin aplicables. Aquest text informa; no és assessorament jurídic.",
    sections: [
      {
        heading: "Responsable del tractament",
        paragraphs: [controllerParagraph()],
      },
      {
        heading: "Quines dades recollim",
        paragraphs: [
          "En mode API, quan envies una o més gravacions per analitzar-les, el servidor les processa temporalment per calcular les puntuacions. Pots donar el consentiment per desar totes les gravacions de la sessió per a recerca de dues maneres: (a) abans d'enregistrar, mitjançant una casella a la pantalla inicial; o (b) després de veure el resultat, en un flux progressiu que pot incloure una pregunta de feedback abans de l'opció de desament. Si acceptes i després tornes a començar dins de la mateixa visita al navegador, recordem aquesta acceptació a la memòria de la pàgina (sense galetes persistents): no et tornem a mostrar la casella i promovem automàticament la nova sessió d'anàlisi; també podem preomplir la comarca que hagis declarat abans, i pots canviar-la abans d'enviar-la.",
          "Si acceptes el desament per a recerca (per qualsevol d'aquestes vies), podem conservar els arxius d'àudio de totes les gravacions de la sessió (dades personals; la veu pot permetre identificar o reconèixer una persona), la data, el text que has llegit en veu alta, les puntuacions individuals, el resultat final combinat, la versió de la política acceptada i les metadades de feedback associades a la sessió mitjançant un identificador de sessió. No desem l'adreça IP ni el User-Agent del navegador: l'IP només s'utilitza de manera transitòria a la memòria del servidor per limitar el nombre de peticions, i no s'escriu a la base de dades ni s'associa a cap sessió.",
          "Al flux de resultats, pots indicar si consideres que l'estimació ha encertat o no i, si vols, de quina o quines comarques ets lingüísticament; d'aquestes comarques en derivem la zona macrodialectal corresponent (balear, central, septentrional, nord-occidental o valencià), o «mixt» si n'indiques de zones diferents. Respondre la comarca és voluntari: pots tancar el full sense enviar-la, i el servei funciona igualment. Aquesta informació la declares tu; no la deduïm de la connexió ni de cap altre senyal tècnic. Serveix per calibrar models de veu catalana i es tracta com a similitud acústica amb una zona dialectal, no com a prova d'origen geogràfic ni de residència. També pots afegir un comentari opcional.",
          "Si rebutges explícitament el desament per a recerca, enviem una sol·licitud per esborrar immediatament totes les gravacions pendents de la sessió i també els textos llegits, les puntuacions i el resultat final. Si la sol·licitud falla, el full de consentiment es manté obert perquè la puguis tornar a provar; si abandones la sessió sense prendre una decisió, el termini de pendent actua com a protecció addicional. Les respostes de feedback que hagis enviat (encert, comarca declarada i zona derivada) es poden conservar sense enllaç a la sessió (sense identificador de sessió) per a calibratge agregat; no utilitzem l'àudio per a entrenament.",
          "En mode mock (simulació local), l'àudio no s'envia a un servidor d'aquest projecte; només es processa al teu navegador amb resultats ficticis.",
          "No demanem nom, correu electrònic ni creació de compte. No enllacem les gravacions amb la teva identitat civil. El desament per a recerca és pseudònim (identificadors de sessió o gravació), no anònim: algú amb accés als fitxers podria reconèixer una veu.",
        ],
      },
      {
        heading: "Per a què les fem servir",
        paragraphs: [
          "Per retornar-te una estimació de similitud acústica amb cinc zones macrodialectals catalanes (tractament transitori necessari per prestar el servei que demanes).",
          "Al flux de resultats, per calibrar models amb les teves respostes sobre l'encert de l'estimació i, si la indiques, amb la comarca que declares i la zona macrodialectal que se'n deriva, sempre com a similitud acústica i no com a origen geogràfic ni identitat.",
          "Només si ho acceptes explícitament (a la pantalla inicial o al flux de resultats): per conservar les gravacions de la sessió, les puntuacions, el resultat combinat i les metadades associades com a donació de veu per a recerca en tecnologies de la parla en català. Això inclou millorar aquest prototip i entrenar, avaluar i publicar models o embeddings de dialecte, reconeixement de veu, síntesi o altres sistemes de parla catalana, així com elaborar i, si s'escau, publicar conjunts de dades de recerca (vegeu «Publicació de models i conjunts de dades»). L'única referència geogràfica que pot acompanyar una sessió és la comarca que declares voluntàriament; no inferim cap localització a partir de l'adreça IP ni de cap altra dada de connexió. Això no equival a determinar el teu lloc de naixement ni la teva identitat dialectal personal.",
          "Per atendre sol·licituds de gestió o supressió quan puguem identificar els registres corresponents.",
        ],
      },
      {
        heading: "Base jurídica",
        paragraphs: [
          "L'anàlisi puntual (sense desament per a entrenament) es fa per prestar el servei que sol·licites en enviar la gravació (art. 6.1.b RGPD) i, quan correspongui, amb el teu consentiment a utilitzar el prototip.",
          "El desament de les gravacions de la sessió i de les metadades associades per a recerca i tecnologies de la parla en català es basa en el teu consentiment explícit i específic (art. 6.1.a RGPD), mitjançant la casella de la pantalla inicial o l'opció de desament del flux progressiu de resultats (després del feedback, si escau). Si has acceptat i continues amb «Tornar a l'inici» a la mateixa visita, reutilitzem aquesta elecció afirmativa per a les sessions noves d'aquella visita (cada sessió es desa amb el seu propi identificador i registre de consentiment). Pots retirar el consentiment per al futur; la retirada no afecta la licitud del tractament fet mentre el consentiment era vigent, ni els models o publicacions ja elaborats a partir d'aquelles dades.",
          "Les respostes de feedback dialectal al flux de resultats (encert i, si la vols indicar, comarca autodeclarada) es basen en el teu consentiment explícit en participar-hi (art. 6.1.a RGPD). Si també acceptes el desament de l'àudio, el feedback queda associat a la sessió i a totes les gravacions mitjançant l'identificador de sessió.",
        ],
      },
      {
        heading: "Conservació i seguretat",
        paragraphs: [
          "Les gravacions pendents de consentiment es guarden temporalment al servidor mentre decideixes. Si rebutges explícitament el desament a la pantalla de resultats, enviem una sol·licitud d'esborrat immediat de totes les gravacions de la sessió i buidem els textos llegits, les puntuacions i el resultat final; si falla, pots reintentar la mateixa acció des del full de consentiment. Si surts sense haver optat per desar-les, el servidor les elimina quan rep la petició de sortida o, si no arriba, quan expira el termini curt de pendent; només queden files tècniques marcades com a esborrades.",
          "Si abandones la sessió sense prendre una decisió, les gravacions pendents s'esborren automàticament al cap d'un termini curt (per defecte fins a 30 minuts). Aquesta finestra només és una mesura de seguretat per a sessions abandonades, no un període de retenció actiu.",
          "Si acceptes la recerca, conservem totes les gravacions de la sessió i les metadades associades (sense adreça IP ni User-Agent) mentre el prototip de recerca estigui actiu, amb un màxim de 3 anys des del consentiment, o fins que atenguem una sol·licitud de supressió identificable, llevat d'obligacions legals de conservació. Passat aquest termini, es poden esborrar amb l'eina d'operador de retenció. Els models i conjunts de dades ja publicats no es «desentrenen» automàticament (vegeu més avall).",
          "Apliquem mesures tècniques i organitzatives raonables per a un prototip de recerca (accés restringit al servidor i esborrat manual per identificador). No prometem el mateix nivell de controls que un servei comercial certificat.",
        ],
      },
      {
        heading: "Publicació de models i conjunts de dades",
        paragraphs: [
          "Si acceptes desar la veu per a recerca, autoritzes que aquestes contribucions (àudio, text llegit i metadades no identificatives que hi associïs, com ara la comarca autodeclarada) es puguin utilitzar per entrenar i publicar models de parla catalana de recerca o de codi obert, i per elaborar conjunts de dades destinats a recerca lingüística i tecnològica.",
          "Abans de publicar àudio original, actualitzarem aquesta política amb la llicència concreta del conjunt (per exemple una llicència oberta de recerca) i, si cal, un avís al servei. No venem gravacions en brut com a producte comercial. Un conjunt publicat pot ser descarregat per tercers; no podem garantir que recuperem totes les còpies que ja hagin sortit del nostre control.",
          "Si més endavant identifiques una contribució teva (amb els IDs de «Gestiona les meves dades») i en demanes la supressió, farem el que puguem raonablement: esborrar o deixar de distribuir els fitxers que encara controlem i excloure'ls de versions futures del conjunt i d'entrenaments nous. No podem desfer models ja entrenats ni versions o miralls ja descarregats. La retirada del consentiment no obliga a reentrenar models existents.",
        ],
      },
      {
        heading: "Encàrrecs, allotjament i transferències",
        paragraphs: [
          "No venem les teves dades personals. El tractament i l'allotjament del servei es fan a Espanya / dins de l'Espai Econòmic Europeu. Podem fer servir proveïdors tècnics (allotjament, infraestructura) estrictament per operar el servei. Podem divulgar dades si la llei ho exigeix.",
          "Els models o components de tercers s'executen al servidor a Espanya per generar les puntuacions; no impliquen cedir el teu àudio amb finalitats de màrqueting.",
          "El codificador de veu utilitzat en mode API és HuBERT català (BSC-LT/hubert-base-ca-2k), de la Language Technologies Unit del Barcelona Supercomputing Center, sota llicència Apache-2.0. Es descarrega i s'executa al servidor; no cedim el teu àudio a BSC amb finalitats de màrqueting.",
          "Per a mètriques d'ús del producte (esdeveniments tècnics com ara visualització de la pàgina o inici d'una gravació, sense àudio ni identificadors de sessió o gravació) podem fer servir PostHog Cloud EU (regió europea, Frankfurt), amb configuració sense galetes de seguiment persistents i sense captura de l'adreça IP. No hi enviem gravacions, puntuacions ni dades de consentiment.",
        ],
      },
      {
        heading: "Els teus drets",
        paragraphs: [
          "Pots exercir els drets d'accés, rectificació, supressió, limitació, portabilitat i oposició, i el dret a retirar el consentiment, quan correspongui i en la mesura que puguem identificar les dades que et concernixen.",
          `No mantenim un compte ni desem el teu correu, nom o IP amb les gravacions. Els identificadors de sessió i de gravació es mostren a «Gestiona les meves dades» i es guarden al teu navegador (emmagatzematge local), no en un perfil nostre. Si canvies de telèfon o de navegador, esborres les dades del lloc o no copies els IDs, normalment no podrem localitzar les teves gravacions. D'acord amb l'art. 11 del RGPD, no estem obligats a recollir dades addicionals només per reidentificar-te. Si no podem verificar de quins registres es tracta, t'ho comunicarem i no podrem completar la supressió.`,
          `Si tens els IDs, fes la sol·licitud des de «Gestiona les meves dades» o escrivint a ${PRIVACY_EMAIL} amb els IDs de sessió o comentari. Les sol·licituds identificables es processen manualment, normalment en un termini de 30 dies, sobre les còpies que encara controlem.`,
          "També pots presentar una reclamació davant l'Agència Espanyola de Protecció de Dades (AEPD): https://www.aepd.es.",
        ],
      },
      {
        heading: "Menors",
        paragraphs: [
          "El servei està pensat per a persones de 18 anys o més. Per desar les gravacions d'una sessió per a recerca cal confirmar l'edat, ja sigui a la casella de la pantalla inicial o en el flux de resultats. No recollim dades de menors de forma intencionada.",
        ],
      },
      {
        heading: "Canvis",
        paragraphs: [
          "Podem actualitzar aquesta política. La data d'entrada en vigor figura al capdamunt. L'ús continuat del servei després d'un canvi implica que has pogut revisar la versió actual. El consentiment de recerca es demana de nou quan canvia la versió de la política, quan tornes a carregar la pàgina, o quan inicies una sessió sense haver acceptat abans en aquella visita; si has acceptat i utilitzes «Tornar a l'inici» sense recarregar, mantenim l'acceptació només en memòria per a les sessions següents d'aquella visita.",
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
      "Aquests termes regeixen l'ús de l'Oracle d'accents catalans, un prototip de recerca operat des d'Espanya que estima la similitud acústica d'una lectura en veu alta amb zones dialectals catalanes i, si ho acceptes, recull donacions de veu per a recerca en tecnologies de la parla en català. Si no hi estàs d'acord, no utilitzis el servei.",
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
          "En mode API, l'àudio s'envia al servidor a Espanya per analitzar-lo. El desament durable per a recerca només es fa si ho acceptes explícitament: mitjançant la casella de la pantalla inicial abans d'enregistrar, o mitjançant l'opció de desament del flux progressiu de resultats (després del feedback, si escau), d'acord amb la Política de privadesa i el RGPD/LOPDGDD. Si continues amb «Tornar a l'inici» a la mateixa visita després d'haver acceptat, podem aplicar de nou aquella acceptació a les sessions noves d'aquella visita.",
          "Si acceptes, conserves els drets personals sobre la teva veu i ens atorgues una llicència no exclusiva, irrevocable pel que fa a usos ja realitzats, gratuïta i mundial per emmagatzemar, processar, reproduir, adaptar (per exemple extraure característiques o entrenar models), comunicar i sublicenciar totes les gravacions de la sessió i el feedback dialectal associat (incloent-hi la comarca que declaris voluntàriament, la zona macrodialectal que se'n deriva i els comentaris opcionals) amb finalitats de recerca i de desenvolupament de tecnologies de la parla en català: millora d'aquest prototip, entrenament i avaluació de models (dialecte, reconeixement, síntesi o similars), publicació de models o embeddings de recerca o de codi obert, i elaboració i publicació de conjunts de dades de recerca en els termes de la Política de privadesa. No venem l'àudio en brut com a producte. La llicència d'un conjunt publicat es concretarà en un avís o actualització d'aquesta política abans de la publicació de l'àudio original.",
          "En col·laborar, declares que tens 18 anys o més, que la veu és teva (o que tens autoritat per cedir-la), que no hi inclous dades especialment sensibles ni informació de tercers, i que no infringeixes drets d'altri.",
          "Pots demanar la supressió de les còpies que encara controlem si ens fas arribar els identificadors de «Gestiona les meves dades». Sense aquests IDs, i com que no mantenim un compte ni desem el teu correu o IP amb l'àudio, sovint no podrem localitzar la teva contribució. La supressió, quan sigui possible, no desfa models ja entrenats ni còpies de conjunts que tercers ja hagin descarregat.",
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
          "El codi, el disseny, els textos de l'interfície i els actius del prototip pertanyen als seus autors o llicenciants. El codi del repositori es publica sota AGPL-3.0. Se't concedeix un dret limitat d'ús personal no comercial del servei tal com s'ofereix.",
          "El codificador HuBERT català (BSC-LT/hubert-base-ca-2k) és © 2025 Language Technologies Unit, Barcelona Supercomputing Center, i es regeix per la llicència Apache-2.0. El classificador publicat a Hugging Face (capçalera sklearn) té la seva pròpia llicència (MIT) i no redistribueix els pesos d'HuBERT modificats.",
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
