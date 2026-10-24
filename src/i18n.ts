import type { Language } from './storage.ts';
const en={
  country:'Sweden',
  escape:'The gravel escape.', eyebrow:'A LITTLE FURTHER FROM EVERYDAY', subtitle:'Six roads. Three landscapes. Your next personal best.',
  choose:'Choose a route', play:'Start rally', practice:'Free drive', practiceNote:'Practice without medals or records.', back:'Back', title:'Title screen', language:'Language',
  forest:'Pine woods', lakes:'Lake country', hills:'Småland highlands', circuit:'Circuit · 1 lap', stage:'Rally stage', route:'Route', routes:'The road ahead',
  routeIntro:'Earn bronze to unlock the next route. Return anytime to beat your best.', locked:'Locked', unlock:'Earn bronze on the previous route',
  best:'Personal best', noRecord:'No time set', gold:'Gold', silver:'Silver', bronze:'Bronze', none:'No medal', target:'Medal targets',
  drive:'Drive', handbrake:'Handbrake', recover:'Recover +5s', pause:'Pause', resume:'Resume', restart:'Try again', menu:'Routes', next:'Next route',
  controls:'Controls', controlInfo:'WASD / arrows to drive · Space to slide · R to recover · Esc to pause',
  rules:'Finish through the checkpoints in order. Final time = driving time + 0.2s per damage point + 5s per recovery.',
  caution:'Watch for wildlife. Light impacts cause damage; a wreck ends your attempt.',
  ready:'Get ready', go:'GO', paused:'A moment by the roadside.', pausedInfo:'Your rally is paused. The clock and wildlife are stopped.',
  finished:'Across the line.', crashed:'End of the road.', crashInfo:'Your car is wrecked. Take a breath and try again.',
  newRecord:'New personal best!', result:'Final time', drivingTime:'Driving time', damagePenalty:'Damage penalty', recoveryPenalty:'Recovery penalty',
  improvement:'Previous best', noMedalInfo:'Finish faster to earn bronze and open the next road.', unlocked:'Next route unlocked',
  condition:'Car condition', damage:'Damage', time:'Time', checkpoint:'Checkpoint', checkpoints:'Checkpoints', progress:'Progress', split:'Split vs best',
  firstRun:'Set your first record', gravel:'Gravel', offRoad:'Off road', record:'Record', racing:'Rally', freeDrive:'Free drive',
  recovered:'Back on the road · +5s', water:'Water recovery · +5s', boundary:'Map recovery · +5s', impact:'Impact', wildlife:'Wildlife crossing',
  storageWarning:'Progress cannot be saved in this browser. You can still play.',
  graphicsError:'Unable to start the game. Enable WebGL 2 and hardware acceleration, then reload.',
  contextLost:'Graphics interrupted. Reload the page to return to the road.',
  gameLabel:'3D rally game. Drive with WASD or arrow keys.', mapLabel:'Route map and car position', homeLabel:'Småland Racer title screen',
  exitPractice:'Leave free drive', distance:'km', selectLabel:'Choose a course', countdownLabel:'Starting countdown',
};
export type TextKey=keyof typeof en;
const nl: Record<TextKey,string>={
  country:'Zweden',
  escape:'Even helemaal weg.',eyebrow:'VERDER WEG VAN ALLEDAG',subtitle:'Zes routes. Drie landschappen. Jouw volgende record.',
  choose:'Kies een parcours',play:'Start rally',practice:'Vrij rijden',practiceNote:'Oefen zonder medailles of records.',back:'Terug',title:'Titelscherm',language:'Taal',
  forest:'Dennenbossen',lakes:'Merengebied',hills:'Smålandse heuvels',circuit:'Circuit · 1 ronde',stage:'Rally-etappe',route:'Parcours',routes:'De weg voor je',
  routeIntro:'Haal brons om het volgende parcours vrij te spelen. Verbeter daarna je eigen record.',locked:'Vergrendeld',unlock:'Haal brons op het vorige parcours',
  best:'Persoonlijk record',noRecord:'Nog geen tijd',gold:'Goud',silver:'Zilver',bronze:'Brons',none:'Geen medaille',target:'Medailletijden',
  drive:'Rijden',handbrake:'Handrem',recover:'Terugzetten +5s',pause:'Pauze',resume:'Verder rijden',restart:'Opnieuw proberen',menu:'Parcoursen',next:'Volgend parcours',
  controls:'Besturing',controlInfo:'WASD / pijltjes om te rijden · Spatie voor handrem · R om terug te zetten · Esc voor pauze',
  rules:'Passeer de checkpoints in volgorde. Eindtijd = rijtijd + 0,2s per schadepunt + 5s per herstelactie.',
  caution:'Let op wild. Lichte botsingen geven schade; bij een total loss eindigt je poging.',
  ready:'Maak je klaar',go:'START',paused:'Even langs de kant.',pausedInfo:'De rally is gepauzeerd. De klok en het wild staan stil.',
  finished:'Over de finish.',crashed:'Einde van de rit.',crashInfo:'Je auto is total loss. Haal adem en probeer het opnieuw.',
  newRecord:'Nieuw persoonlijk record!',result:'Eindtijd',drivingTime:'Rijtijd',damagePenalty:'Schadestraf',recoveryPenalty:'Herstelstraf',
  improvement:'Vorig record',noMedalInfo:'Finish sneller voor brons en speel de volgende route vrij.',unlocked:'Volgend parcours vrijgespeeld',
  condition:'Conditie auto',damage:'Schade',time:'Tijd',checkpoint:'Checkpoint',checkpoints:'Checkpoints',progress:'Voortgang',split:'Verschil met record',
  firstRun:'Zet je eerste record',gravel:'Gravel',offRoad:'Naast de weg',record:'Record',racing:'Rally',freeDrive:'Vrij rijden',
  recovered:'Terug op de weg · +5s',water:'Uit het water · +5s',boundary:'Terug binnen de kaart · +5s',impact:'Botsing',wildlife:'Overstekend wild',
  storageWarning:'Voortgang opslaan lukt niet in deze browser. Je kunt wel blijven spelen.',
  graphicsError:'Het spel kan niet starten. Schakel WebGL 2 en hardwareversnelling in en laad opnieuw.',
  contextLost:'De grafische verbinding is onderbroken. Laad de pagina opnieuw.',
  gameLabel:'3D-rallyspel. Rijd met WASD of de pijltjestoetsen.',mapLabel:'Parcourskaart met autopositie',homeLabel:'Småland Racer titelscherm',
  exitPractice:'Stop vrij rijden',distance:'km',selectLabel:'Kies een parcours',countdownLabel:'Aftellen voor de start',
};
const sv: Record<TextKey,string>={
  country:'Sverige',
  escape:'Bortom vardagen.',eyebrow:'LITE LÄNGRE FRÅN VARDAGEN',subtitle:'Sex vägar. Tre landskap. Ditt nästa personbästa.',
  choose:'Välj en bana',play:'Starta rally',practice:'Fri körning',practiceNote:'Träna utan medaljer eller rekord.',back:'Tillbaka',title:'Titelskärm',language:'Språk',
  forest:'Tallskog',lakes:'Sjöriket',hills:'Småländska höjder',circuit:'Rundbana · 1 varv',stage:'Rallysträcka',route:'Bana',routes:'Vägen framför dig',
  routeIntro:'Ta brons för att låsa upp nästa bana. Kom tillbaka och slå ditt personbästa.',locked:'Låst',unlock:'Ta brons på föregående bana',
  best:'Personbästa',noRecord:'Ingen tid ännu',gold:'Guld',silver:'Silver',bronze:'Brons',none:'Ingen medalj',target:'Medaljtider',
  drive:'Kör',handbrake:'Handbroms',recover:'Till vägen +5s',pause:'Paus',resume:'Fortsätt',restart:'Försök igen',menu:'Banor',next:'Nästa bana',
  controls:'Kontroller',controlInfo:'WASD / piltangenter för att köra · Mellanslag för handbroms · R till vägen · Esc för paus',
  rules:'Passera kontrollerna i ordning. Sluttid = körtid + 0,2s per skadepoäng + 5s per återställning.',
  caution:'Se upp för vilt. Lätta kollisioner ger skador; en krasch kan avsluta försöket.',
  ready:'Gör dig redo',go:'KÖR',paused:'En stund vid vägkanten.',pausedInfo:'Rallyt är pausat. Klockan och djuren står stilla.',
  finished:'Över mållinjen.',crashed:'Vägen tog slut.',crashInfo:'Bilen är totalförstörd. Ta ett andetag och försök igen.',
  newRecord:'Nytt personbästa!',result:'Sluttid',drivingTime:'Körtid',damagePenalty:'Skadetillägg',recoveryPenalty:'Återställningstillägg',
  improvement:'Tidigare rekord',noMedalInfo:'Kör snabbare för brons och lås upp nästa väg.',unlocked:'Nästa bana upplåst',
  condition:'Bilens skick',damage:'Skador',time:'Tid',checkpoint:'Kontroll',checkpoints:'Kontroller',progress:'Framsteg',split:'Mellantid mot rekord',
  firstRun:'Sätt ditt första rekord',gravel:'Grus',offRoad:'Utanför vägen',record:'Rekord',racing:'Rally',freeDrive:'Fri körning',
  recovered:'Tillbaka på vägen · +5s',water:'Upp ur vattnet · +5s',boundary:'Tillbaka på kartan · +5s',impact:'Kollision',wildlife:'Vilt korsar vägen',
  storageWarning:'Det går inte att spara framsteg i den här webbläsaren. Du kan fortfarande spela.',
  graphicsError:'Spelet kunde inte starta. Aktivera WebGL 2 och hårdvaruacceleration och ladda om.',
  contextLost:'Grafiken avbröts. Ladda om sidan för att återvända till vägen.',
  gameLabel:'3D-rallyspel. Kör med WASD eller piltangenterna.',mapLabel:'Bana med bilens position',homeLabel:'Småland Racer titelskärm',
  exitPractice:'Avsluta fri körning',distance:'km',selectLabel:'Välj en bana',countdownLabel:'Nedräkning till start',
};
export const dictionaries: Record<Language,Record<TextKey,string>>={en,nl,sv};
export function text(language:Language,key:TextKey): string { return dictionaries[language][key]; }
export function formatTime(seconds:number,language:Language='en'): string {
  const rounded=Math.round(seconds*100);
  const minutes=Math.floor(rounded/6000);
  const rest=((rounded%6000)/100).toLocaleString(language,{minimumIntegerDigits:2,minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  return `${minutes}:${rest}`;
}
