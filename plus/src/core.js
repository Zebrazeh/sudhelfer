/* ===== Sudhelfer core: MMuM-Parser + Schrittgenerator (ohne DOM) ===== */

/* ---------- Sprache ---------- */
var LANGS = ['de', 'en'];
var LANG = 'de';
/* tx('deutsch', 'english'): Text in der aktiven Sprache. Fehlt eine Sprache, gilt Deutsch. */
function tx() { var i = LANGS.indexOf(LANG); return arguments[i] !== undefined ? arguments[i] : arguments[0]; }
function setLang(l) { if (LANGS.indexOf(l) >= 0) LANG = l; return LANG; }

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  var m = s.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function pos(v) { var n = num(v); return n !== null && n > 0 ? n : null; }
function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function fmtNum(n, maxDec) {
  if (n === null || n === undefined || !isFinite(n)) return '–';
  var d = maxDec === undefined ? 1 : maxDec;
  var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return LANG === 'de' ? s.replace('.', ',') : s;
}
function fmtAmount(a, unit) {
  if (a === null) return '';
  var u = (unit || '').trim();
  var ul = u.toLowerCase();
  var d = 2;
  if (ul === 'g') d = a < 10 ? 1 : 0;
  else if (ul === 'kg') d = 2;
  else if (ul === 'l') d = 1;
  else if (ul === 'ml') d = 0;
  return fmtNum(a, d) + (u ? ' ' + u : '');
}
function fmtL(v) { return fmtNum(v, 1) + ' L'; }
function fmtT(v) { return fmtNum(v, 1) + ' °C'; }

function hopType(t) {
  var s = str(t).toLowerCase();
  if (s.indexOf('vorder') >= 0 || s === 'vwh' || s.indexOf('first') >= 0) return 'fwh';
  if (s.indexOf('whirl') >= 0) return 'whirlpool';
  return 'boil';
}

/* ---------- Parser ---------- */
function parseMMuM(raw) {
  var j = raw;
  if (typeof raw === 'string') {
    var txt = raw.replace(/^﻿/, '').trim();
    j = JSON.parse(txt);
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error(tx('Die Datei enthält kein Rezept-Objekt.','The file does not contain a recipe object.'));
  var R = {
    source: str(j.Rezeptquelle), version: str(j.ExportVersion) || (j.Malze ? '2.0' : '1.x'),
    name: str(j.Name) || tx('Unbenanntes Rezept','Untitled recipe'), date: str(j.Datum), style: str(j.Sorte), author: str(j.Autor),
    batchL: pos(j.Ausschlagwuerze !== undefined ? j.Ausschlagwuerze : j.Ausschlagswuerze),
    sha: pos(j.Sudhausausbeute), og: pos(j.Stammwuerze), ibu: pos(j.Bittere), ebc: pos(j.Farbe), abv: pos(j.Alkohol),
    desc: str(j.Kurzbeschreibung), note: str(j.Anmerkung_Autor),
    malts: [], mashForm: str(j.Maischform).toLowerCase() || 'infusion',
    mainWater: pos(j.Hauptguss !== undefined ? j.Hauptguss : j.Infusion_Hauptguss),
    mashInTemp: pos(j.Einmaischtemperatur !== undefined ? j.Einmaischtemperatur : j.Infusion_Einmaischtemperatur),
    rests: [], decoctions: [], mashOutTemp: pos(j.Abmaischtemperatur), spargeWater: pos(j.Nachguss),
    boilTime: num(j.Kochzeit_Wuerze), hops: [], boilAdds: [], dryHops: [],
    yeast: str(j.Hefe), fermTemp: str(j.Gaertemperatur), attenuation: pos(j.Endvergaerungsgrad),
    carbonation: pos(j.Karbonisierung), fermAdds: [], warnings: []
  };
  var i, k, x;
  // Malze
  if (Array.isArray(j.Malze)) {
    j.Malze.forEach(function (m) { if (str(m.Name) && num(m.Menge) !== null) R.malts.push({ name: str(m.Name), amount: num(m.Menge), unit: str(m.Einheit) || 'kg', ebc: pos(m.Farbe_EBC) }); });
  } else {
    for (i = 1; i <= 30; i++) {
      if (str(j['Malz' + i]) && num(j['Malz' + i + '_Menge']) !== null)
        R.malts.push({ name: str(j['Malz' + i]), amount: num(j['Malz' + i + '_Menge']), unit: str(j['Malz' + i + '_Einheit']) || 'kg' });
    }
  }
  // Rasten
  if (Array.isArray(j.Rasten)) {
    j.Rasten.forEach(function (r) { var t = num(r.Temperatur); if (t !== null) R.rests.push({ temp: t, time: num(r.Zeit) || 0 }); });
  } else {
    for (i = 1; i <= 20; i++) {
      var t1 = num(j['Infusion_Rasttemperatur' + i]);
      if (t1 !== null) R.rests.push({ temp: t1, time: num(j['Infusion_Rastzeit' + i]) || 0 });
    }
  }
  // Dekoktionen
  function pushDec(d) {
    var dd = {
      volume: num(d.Volumen), restTime: num(d.Rastzeit) || 0, tempIs: num(d.Temperatur_ist),
      tempResult: num(d.Temperatur_resultierend), form: str(d.Form),
      partRestTime: num(d.Teilmaische_Rastzeit) || 0, partBoilTime: num(d.Teilmaische_Kochzeit) || 0,
      partTemp: num(d.Teilmaische_Temperatur)
    };
    if (dd.volume || dd.tempResult) R.decoctions.push(dd);
  }
  if (Array.isArray(j.Dekoktionen)) j.Dekoktionen.forEach(pushDec);
  else {
    var groups = {};
    Object.keys(j).forEach(function (key) {
      var m = key.match(/^Dekoktion_(\d+)_(.+)$/);
      if (m) { groups[m[1]] = groups[m[1]] || {}; groups[m[1]][m[2]] = j[key]; }
    });
    Object.keys(groups).sort(function (a, b) { return a - b; }).forEach(function (g) { pushDec(groups[g]); });
  }
  // Hopfen
  if (Array.isArray(j.Hopfenkochen)) {
    j.Hopfenkochen.forEach(function (h) {
      if (!str(h.Sorte) && num(h.Menge) === null) return;
      R.hops.push({ name: str(h.Sorte) || tx('Hopfen','Hops'), amount: num(h.Menge), alpha: num(h.Alpha), time: num(h.Zeit), type: hopType(h.Typ), rawType: str(h.Typ) });
    });
  } else {
    for (i = 1; i <= 20; i++) {
      if (str(j['Hopfen_VWH_' + i + '_Sorte']) || num(j['Hopfen_VWH_' + i + '_Menge']) !== null) {
        if (num(j['Hopfen_VWH_' + i + '_Menge']) === null) continue;
        R.hops.push({ name: str(j['Hopfen_VWH_' + i + '_Sorte']) || tx('Hopfen','Hops'), amount: num(j['Hopfen_VWH_' + i + '_Menge']), alpha: num(j['Hopfen_VWH_' + i + '_alpha']), time: null, type: 'fwh', rawType: 'Vorderwuerze' });
      }
    }
    for (i = 1; i <= 20; i++) {
      var hm = num(j['Hopfen_' + i + '_Menge']);
      if (hm === null) continue;
      var kz = j['Hopfen_' + i + '_Kochzeit'];
      var isWp = /whirl/i.test(str(kz));
      R.hops.push({ name: str(j['Hopfen_' + i + '_Sorte']) || tx('Hopfen','Hops'), amount: hm, alpha: num(j['Hopfen_' + i + '_alpha']), time: isWp ? 0 : num(kz), type: isWp ? 'whirlpool' : 'boil', rawType: isWp ? 'Whirlpool' : 'Standard' });
    }
  }
  // Weitere Zutaten Würze
  if (Array.isArray(j.Gewuerze_etc)) {
    j.Gewuerze_etc.forEach(function (z) { if (str(z.Name)) R.boilAdds.push({ name: str(z.Name), amount: num(z.Menge), unit: str(z.Einheit), time: num(z.Kochzeit) }); });
  } else {
    for (i = 1; i <= 20; i++) {
      x = 'WeitereZutat_Wuerze_' + i + '_';
      if (str(j[x + 'Name'])) R.boilAdds.push({ name: str(j[x + 'Name']), amount: num(j[x + 'Menge']), unit: str(j[x + 'Einheit']), time: num(j[x + 'Kochzeit']) });
    }
  }
  // Stopfhopfen
  if (Array.isArray(j.Stopfhopfen)) {
    j.Stopfhopfen.forEach(function (h) { if (str(h.Sorte) || num(h.Menge) !== null) R.dryHops.push({ name: str(h.Sorte) || tx('Hopfen','Hops'), amount: num(h.Menge) }); });
  } else {
    for (i = 1; i <= 20; i++) if (str(j['Stopfhopfen_' + i + '_Sorte']) || num(j['Stopfhopfen_' + i + '_Menge']) !== null) {
      if (num(j['Stopfhopfen_' + i + '_Menge']) === null && !str(j['Stopfhopfen_' + i + '_Sorte'])) continue;
      R.dryHops.push({ name: str(j['Stopfhopfen_' + i + '_Sorte']) || tx('Hopfen','Hops'), amount: num(j['Stopfhopfen_' + i + '_Menge']) });
    }
  }
  // Weitere Zutaten Gärung
  var wzg = j.WeitereZutatGaerung || j.Weitere_Zutaten_Gaerung || j.WeitereZutat_Gaerung;
  if (Array.isArray(wzg)) {
    wzg.forEach(function (z) { if (str(z.Name)) R.fermAdds.push({ name: str(z.Name), amount: num(z.Menge), unit: str(z.Einheit) }); });
  } else {
    for (i = 1; i <= 20; i++) {
      x = 'WeitereZutat_Gaerung_' + i + '_';
      if (str(j[x + 'Name'])) R.fermAdds.push({ name: str(j[x + 'Name']), amount: num(j[x + 'Menge']), unit: str(j[x + 'Einheit']) });
    }
  }

  // Plausibilität
  if (!R.malts.length && !R.rests.length && R.boilTime === null && !R.hops.length)
    throw new Error(tx('Die Datei enthält kein vollständiges Rezept: Es fehlen Malze, Rasten, Kochzeit und Hopfen. Erwartet wird ein Export von maischemalzundmehr.de (JSON), BeerXML oder BeerJSON.','The file does not contain a complete recipe: malts, rests, boil time and hops are missing. Expected is an export from maischemalzundmehr.de (JSON), BeerXML or BeerJSON.'));
  if (R.batchL === null) R.warnings.push(tx('Das Rezept nennt keine Ausschlagwürze (im Export steht 0). Alle Mengen gelten wie im Rezept, Umrechnen ist nicht möglich.','The recipe does not state a batch volume (the export says 0). All quantities apply as in the recipe; scaling is not possible.'));
  if (R.mainWater === null) R.warnings.push(tx('Hauptguss fehlt im Rezept.','Strike water is missing in the recipe.'));
  if (R.spargeWater === null) R.warnings.push(tx('Nachguss fehlt im Rezept.','Sparge water is missing in the recipe.'));
  if (R.mashInTemp === null) {
    if (R.rests.length) { R.mashInTemp = R.rests[0].temp; R.warnings.push(tx('Einmaischtemperatur fehlt – es wird die Temperatur der 1. Rast (','Mash-in temperature is missing – the temperature of the 1st rest (') + fmtT(R.mashInTemp) + ') verwendet.'); }
    else R.warnings.push(tx('Einmaischtemperatur fehlt im Rezept.','Mash-in temperature is missing in the recipe.'));
  }
  if (R.mashOutTemp === null) { R.mashOutTemp = 78; R.warnings.push(tx('Abmaischtemperatur fehlt – es werden 78 °C verwendet.','Mash-out temperature is missing – 78 °C is used.')); }
  if (R.boilTime === null || R.boilTime <= 0) { R.boilTime = 60; R.warnings.push(tx('Kochzeit fehlt – es werden 60 min verwendet.','Boil time is missing – 60 min is used.')); }
  if (!R.rests.length && !R.decoctions.length) R.warnings.push(tx('Das Rezept enthält keine Rasten.','The recipe contains no rests.'));
  R.hops.forEach(function (h) {
    if (h.type === 'boil' && h.time === null) { h.time = R.boilTime; R.warnings.push(tx('Hopfengabe ','Hop addition ') + h.name + tx(' ohne Kochzeit – wird zu Kochbeginn eingeplant.',' has no boil time – scheduled for the start of the boil.')); }
    if (h.type === 'boil' && h.time > R.boilTime) R.warnings.push(tx('Hopfengabe ','Hop addition ') + h.name + ': ' + h.time + tx(' min ist länger als die Kochzeit (',' min is longer than the boil time (') + R.boilTime + tx(' min) – wird zu Kochbeginn gegeben.',' min) – added at the start of the boil.'));
    if (['fwh', 'whirlpool', 'boil'].indexOf(h.type) >= 0 && h.rawType && !/^(standard|vorderwuerze|vorderwürze|whirlpool)$/i.test(h.rawType))
      R.warnings.push(tx('Unbekannter Hopfen-Typ „','Unknown hop type “') + h.rawType + tx('“ bei ','” for ') + h.name + tx(' – als Kochhopfen behandelt.',' – treated as a boil hop.'));
  });
  R.boilAdds.forEach(function (z) { if (z.time === null) { z.time = 0; R.warnings.push(tx('Zutat ','Addition ') + z.name + tx(' ohne Kochzeit – wird bei Kochende eingeplant.',' has no boil time – scheduled for the end of the boil.')); } });
  return R;
}


/* ---------- Einstieg: erkennt MMuM-JSON, BeerXML und BeerJSON ---------- */
function parseRecipe(raw) {
  var conv = null, j = raw;
  if (typeof raw === 'string') {
    var txt = raw.replace(/^\uFEFF/, '').trim();
    if (txt.charAt(0) === '<') conv = beerxmlToMmum(txt);
    else j = JSON.parse(txt);
  }
  if (!conv && j && typeof j === 'object' && j.beerjson) conv = beerjsonToMmum(j);
  if (conv) j = conv.obj;
  var R = parseMMuM(j);
  R.format = conv ? conv.format : (str(j.Sudhelfer_Format) || 'maischemalzundmehr.de');
  R.edited = !!j.Sudhelfer_Bearbeitet;
  if (conv) R.warnings = conv.warnings.concat(R.warnings);
  return R;
}

/* ===== Import offener Standards: BeerXML 1.0 und BeerJSON 1.0 -> MMuM-v2-Objekt ===== */

/* --- kleiner XML-Parser (reicht für BeerXML: Elemente, Text, Entities, CDATA, Kommentare) --- */
function xmlParse(src) {
  var pos = 0, root = { tag: '#root', kids: [], text: '' }, stack = [root];
  function ent(t) {
    return t.replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  while (pos < src.length) {
    var lt = src.indexOf('<', pos);
    if (lt < 0) { stack[stack.length - 1].text += ent(src.slice(pos)); break; }
    if (lt > pos) stack[stack.length - 1].text += ent(src.slice(pos, lt));
    if (src.startsWith('<!--', lt)) { var e1 = src.indexOf('-->', lt); pos = e1 < 0 ? src.length : e1 + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { var e2 = src.indexOf(']]>', lt); stack[stack.length - 1].text += src.slice(lt + 9, e2 < 0 ? src.length : e2); pos = e2 < 0 ? src.length : e2 + 3; continue; }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) { var e3 = src.indexOf('>', lt); pos = e3 < 0 ? src.length : e3 + 1; continue; }
    var gt = src.indexOf('>', lt); if (gt < 0) throw new Error(tx('Die XML-Datei ist unvollständig.','The XML file is incomplete.'));
    var raw = src.slice(lt + 1, gt).trim();
    if (raw.charAt(0) === '/') {
      var name = raw.slice(1).trim().toUpperCase();
      while (stack.length > 1 && stack[stack.length - 1].tag !== name) stack.pop();
      if (stack.length > 1) stack.pop();
    } else {
      var self = raw.charAt(raw.length - 1) === '/';
      var tag = raw.replace(/\/$/, '').split(/\s+/)[0].toUpperCase();
      var node = { tag: tag, kids: [], text: '' };
      stack[stack.length - 1].kids.push(node);
      if (!self) stack.push(node);
    }
    pos = gt + 1;
  }
  return root;
}
function xKid(n, tag) { if (!n) return null; for (var i = 0; i < n.kids.length; i++) if (n.kids[i].tag === tag) return n.kids[i]; return null; }
function xKids(n, tag) { return n ? n.kids.filter(function (k) { return k.tag === tag; }) : []; }
function xTxt(n, tag) { var k = xKid(n, tag); return k ? k.text.trim() : ''; }
function xNum(n, tag) { return num(xTxt(n, tag)); }
function xFind(n, tag) { if (!n) return null; if (n.tag === tag) return n; for (var i = 0; i < n.kids.length; i++) { var f = xFind(n.kids[i], tag); if (f) return f; } return null; }

function r1(v, d) { var f = Math.pow(10, d === undefined ? 1 : d); return Math.round(v * f) / f; }
function massOut(g) { return g >= 1000 ? { Menge: r1(g / 1000, 3), Einheit: 'kg' } : { Menge: r1(g, 1), Einheit: 'g' }; }
function tempStrC(s) { // "72.4 C", "162 F", "72"
  var m = String(s || '').match(/(-?\d+(?:[.,]\d+)?)\s*°?\s*([CF])?/i); if (!m) return null;
  var v = parseFloat(m[1].replace(',', '.')); return m[2] && m[2].toUpperCase() === 'F' ? (v - 32) * 5 / 9 : v;
}
function colorStrEBC(s) {
  var m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*(EBC|SRM|L|Lovi)?/i); if (!m) return null;
  var v = parseFloat(m[1].replace(',', '.')), u = (m[2] || 'SRM').toUpperCase();
  if (u === 'EBC') return v; if (u === 'L' || u === 'LOVI') return (1.3546 * v - 0.76) * 1.97; return v * 1.97;
}
function sgStrPlato(s) {
  var m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*(SG|PLATO|°P|P|BRIX)?/i); if (!m) return null;
  var v = parseFloat(m[1].replace(',', '.')), u = (m[2] || '').toUpperCase();
  if (u === 'PLATO' || u === '°P' || u === 'P') return v; if (u === 'BRIX') return v / 1.03;
  return v < 1.5 ? sgToPlato(v) : v;
}
var CO2_GL_PER_VOL = 1.97;
var SUGARISH = /sugar|zucker|kandis|candi|honey|honig|syrup|sirup|extract|extrakt|dextrose|glukose|glucose|lactose|laktose|molasses|melasse/i;

/* ---------- BeerXML 1.0 ---------- */
function beerxmlToMmum(text) {
  var doc = xmlParse(text), W = [];
  var recs = xKids(xKid(doc, 'RECIPES') || doc, 'RECIPE');
  if (!recs.length) { var one = xFind(doc, 'RECIPE'); if (one) recs = [one]; }
  if (!recs.length) throw new Error(tx('In der XML-Datei wurde kein BeerXML-Rezept (<RECIPE>) gefunden.','No BeerXML recipe (<RECIPE>) was found in the XML file.'));
  if (recs.length > 1) W.push(tx('Die Datei enthält ','The file contains ') + recs.length + tx(' Rezepte. Übernommen wurde das erste: „',' recipes. The first one was imported: “') + xTxt(recs[0], 'NAME') + '“.');
  var r = recs[0];
  var o = { Rezeptquelle: 'BeerXML-Datei', ExportVersion: 'BeerXML 1.0', Name: xTxt(r, 'NAME'), Datum: xTxt(r, 'DATE'), Sorte: xTxt(xKid(r, 'STYLE'), 'NAME'), Autor: xTxt(r, 'BREWER'),
    Malze: [], Rasten: [], Hopfenkochen: [], Gewuerze_etc: [], Stopfhopfen: [], WeitereZutatGaerung: [] };
  var type = xTxt(r, 'TYPE').toLowerCase();
  if (type && type.indexOf('all grain') < 0) W.push(tx('Rezepttyp „','Recipe type “') + xTxt(r, 'TYPE') + tx('“: Die App ist für Rezepte mit Maischen ausgelegt. Extrakt-Anteile prüfen.','”: the app is designed for all-grain recipes with a mash. Check the extract portions.'));
  var batch = xNum(r, 'BATCH_SIZE'), boilSize = xNum(r, 'BOIL_SIZE');
  o.Ausschlagwuerze = batch; if (batch) W.push(tx('BeerXML nennt die Chargengröße (meist Menge im Gärbehälter). Sie wird als Ausschlagwürze verwendet.','BeerXML states the batch size (usually the volume in the fermenter). It is used as the batch volume here.'));
  o.Sudhausausbeute = xNum(r, 'EFFICIENCY');
  o.Kochzeit_Wuerze = xNum(r, 'BOIL_TIME');
  var og = xNum(r, 'OG') || sgStrPlato(xTxt(r, 'EST_OG')); o.Stammwuerze = og ? r1(og < 1.5 ? sgToPlato(og) : og, 1) : null;
  o.Bittere = xNum(r, 'IBU'); var col = xTxt(r, 'EST_COLOR'); o.Farbe = col ? r1(colorStrEBC(col), 0) : null;
  o.Alkohol = num(xTxt(r, 'ABV') || xTxt(r, 'EST_ABV'));
  var carb = xNum(r, 'CARBONATION'); o.Karbonisierung = carb ? r1(carb > 4.5 ? carb : carb * CO2_GL_PER_VOL, 1) : null;
  o.Kurzbeschreibung = xTxt(r, 'TASTE_NOTES'); o.Anmerkung_Autor = xTxt(r, 'NOTES');
  var maltKg = 0;
  xKids(xKid(r, 'FERMENTABLES'), 'FERMENTABLE').forEach(function (f) {
    var name = xTxt(f, 'NAME'), ft = xTxt(f, 'TYPE').toLowerCase(), kg = xNum(f, 'AMOUNT') || 0, after = /true/i.test(xTxt(f, 'ADD_AFTER_BOIL'));
    var mm = massOut(kg * 1000);
    if ((ft === 'grain' || ft === 'adjunct') && !after && !SUGARISH.test(name + ' ' + ft)) { o.Malze.push({ Name: name, Menge: mm.Menge, Einheit: mm.Einheit }); maltKg += kg; }
    else if (after) { o.WeitereZutatGaerung.push({ Name: name, Menge: mm.Menge, Einheit: mm.Einheit }); }
    else { o.Gewuerze_etc.push({ Name: name, Menge: mm.Menge, Einheit: mm.Einheit, Kochzeit: 0 }); W.push('„' + name + tx('“: BeerXML nennt keinen Zeitpunkt. Eingeplant bei Kochende, bitte im Original prüfen.','”: BeerXML gives no time. Scheduled for the end of the boil, please check the original.')); }
  });
  xKids(xKid(r, 'HOPS'), 'HOP').forEach(function (h) {
    var name = xTxt(h, 'NAME'), use = xTxt(h, 'USE').toLowerCase(), g = (xNum(h, 'AMOUNT') || 0) * 1000, a = xNum(h, 'ALPHA'), t = xNum(h, 'TIME');
    if (use.indexOf('dry') >= 0) { o.Stopfhopfen.push({ Sorte: name, Menge: r1(g, 1) }); if (t) W.push(tx('Hopfenstopfen „','Dry hop “') + name + tx('“: laut Datei ','”: according to the file ') + r1(t / 1440, 0) + tx(' Tage im Bier.',' days in the beer.')); }
    else if (use.indexOf('first') >= 0) o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: 0, Typ: 'Vorderwuerze' });
    else if (use.indexOf('aroma') >= 0 || use.indexOf('whirl') >= 0) o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: t || 0, Typ: 'Whirlpool' });
    else if (use.indexOf('mash') >= 0) { o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: 0, Typ: 'Vorderwuerze' }); W.push(tx('Maischehopfen „','Mash hop “') + name + tx('“ wird als Vorderwürzehopfen eingeplant. Willst du ihn wie im Original in die Maische geben, tu das beim Einmaischen.','” is scheduled as a first wort hop. If you want to add it to the mash as in the original, do so when mashing in.')); }
    else o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: t, Typ: 'Standard' });
  });
  xKids(xKid(r, 'MISCS'), 'MISC').forEach(function (m) {
    var name = xTxt(m, 'NAME'), use = xTxt(m, 'USE').toLowerCase(), amt = xNum(m, 'AMOUNT'), w = /true/i.test(xTxt(m, 'AMOUNT_IS_WEIGHT')), t = xNum(m, 'TIME');
    var q = amt === null ? { Menge: null, Einheit: '' } : w ? massOut(amt * 1000) : (amt < 1 ? { Menge: r1(amt * 1000, 0), Einheit: 'ml' } : { Menge: r1(amt, 2), Einheit: 'l' });
    if (use === 'boil') o.Gewuerze_etc.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit, Kochzeit: t || 0 });
    else if (use === 'primary' || use === 'secondary' || use === 'bottling') o.WeitereZutatGaerung.push({ Name: name + (use === 'bottling' ? tx(' (beim Abfüllen)',' (at bottling)') : ''), Menge: q.Menge, Einheit: q.Einheit });
    else W.push('„' + name + '“ (' + (use || tx('ohne Angabe','not specified')) + '): ' + (q.Menge !== null ? q.Menge + ' ' + q.Einheit : '') + tx('. Wird nicht als Schritt angezeigt, bitte selbst einplanen (z. B. Wasseraufbereitung).','. Not shown as a step, please plan it yourself (e.g. water treatment).'));
  });
  var y = xKid(xKid(r, 'YEASTS'), 'YEAST');
  if (y) {
    var yn = [xTxt(y, 'NAME'), [xTxt(y, 'LABORATORY'), xTxt(y, 'PRODUCT_ID')].filter(Boolean).join(' ')].filter(Boolean);
    o.Hefe = yn[0] + (yn[1] && yn[0].indexOf(xTxt(y, 'PRODUCT_ID')) < 0 ? ' (' + yn[1] + ')' : '');
    o.Endvergaerungsgrad = xNum(y, 'ATTENUATION');
    var tmin = xNum(y, 'MIN_TEMPERATURE'), tmax = xNum(y, 'MAX_TEMPERATURE'), pt = xNum(r, 'PRIMARY_TEMP');
    o.Gaertemperatur = pt ? String(r1(pt, 0)) : (tmin && tmax ? r1(tmin, 0) + '-' + r1(tmax, 0) : '');
  }
  var mash = xKid(r, 'MASH'), steps = xKids(xKid(mash, 'MASH_STEPS'), 'MASH_STEP');
  steps.forEach(function (s, i) {
    var st = (xTxt(s, 'TYPE') || '').toLowerCase(), temp = xNum(s, 'STEP_TEMP'), time = xNum(s, 'STEP_TIME') || 0, inf = xNum(s, 'INFUSE_AMOUNT');
    if (i === 0) { o.Hauptguss = inf; var it = tempStrC(xTxt(s, 'INFUSE_TEMP')); o.Einmaischtemperatur = it ? r1(it, 0) : null; }
    else if (st === 'infusion' && inf) W.push(tx('Rast „','Rest “') + xTxt(s, 'NAME') + tx('“: Das Original gibt ','”: the original adds ') + r1(inf, 1) + tx(' L heißes Wasser zu. Die App heizt stattdessen auf ',' L of hot water. The app heats to ') + r1(temp, 0) + ' °C.');
    if (st === 'decoction') W.push(tx('Rast „','Rest “') + xTxt(s, 'NAME') + tx('“ ist im Original eine Dekoktion. BeerXML beschreibt die Teilmaische nicht, die App plant eine normale Rast.','” is a decoction in the original. BeerXML does not describe the decoction, so the app plans a normal rest.'));
    if (temp !== null) o.Rasten.push({ Temperatur: r1(temp, 1), Zeit: time });
  });
  if (o.Rasten.length) { var last = o.Rasten[o.Rasten.length - 1]; if (last.Temperatur >= 75) o.Abmaischtemperatur = last.Temperatur; }
  if (o.Einmaischtemperatur === null && o.Rasten.length) W.push(tx('Die Einmaischtemperatur fehlt in der Datei. Erhitze das Wasser etwa 3–5 °C über die erste Rast.','The mash-in temperature is missing in the file. Heat the water to about 3–5 °C above the first rest.'));
  if (o.Hauptguss && boilSize) {
    var ng = boilSize - o.Hauptguss + maltKg * 1.0;
    o.Nachguss = ng > 0 ? r1(ng, 1) : null;
    W.push(tx('Nachguss geschätzt aus Pfannevollwürze (','Sparge water estimated from the pre-boil volume (') + r1(boilSize, 1) + tx(' L) − Hauptguss + 1 L je kg Malz Treberverlust. Mit deiner Anlage abgleichen.',' L) − strike water + 1 L per kg of malt absorbed by the grain. Check against your own equipment.'));
  }
  return { obj: o, warnings: W, format: 'BeerXML' };
}

/* ---------- BeerJSON 1.0 ---------- */
var VOL_L = { l: 1, ml: 0.001, tsp: 0.00492892, tbsp: 0.0147868, floz: 0.0295735, cup: 0.236588, pt: 0.473176, qt: 0.946353, gal: 3.78541, bbl: 117.348, ifloz: 0.0284131, ipt: 0.568261, iqt: 1.13652, igal: 4.54609, ibbl: 163.659 };
var MASS_G = { mg: 0.001, g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };
function bjVolL(v) { return v && v.value !== undefined && VOL_L[String(v.unit).toLowerCase()] !== undefined ? v.value * VOL_L[String(v.unit).toLowerCase()] : null; }
function bjMassG(v) { return v && v.value !== undefined && MASS_G[String(v.unit).toLowerCase()] !== undefined ? v.value * MASS_G[String(v.unit).toLowerCase()] : null; }
function bjTempC(v) { if (!v || v.value === undefined) return null; return String(v.unit).toUpperCase() === 'F' ? (v.value - 32) * 5 / 9 : v.value; }
function bjMin(v) { if (!v || v.value === undefined) return null; var f = { sec: 1 / 60, min: 1, hr: 60, day: 1440, week: 10080 }[String(v.unit).toLowerCase()]; return f === undefined ? v.value : v.value * f; }
function bjDays(v) { var m = bjMin(v); return m === null ? null : m / 1440; }
function bjPlato(v) { if (!v || v.value === undefined) return null; var u = String(v.unit).toLowerCase(); return u === 'plato' ? v.value : u === 'brix' ? v.value / 1.03 : sgToPlato(v.value); }
function bjEBC(v) { if (!v || v.value === undefined) return null; var u = String(v.unit).toUpperCase(); return u === 'EBC' ? v.value : u === 'LOVI' ? (1.3546 * v.value - 0.76) * 1.97 : v.value * 1.97; }
function bjAmount(a) {
  var g = bjMassG(a); if (g !== null) return massOut(g);
  var l = bjVolL(a); if (l !== null) return l < 1 ? { Menge: r1(l * 1000, 0), Einheit: 'ml' } : { Menge: r1(l, 2), Einheit: 'l' };
  return a && a.value !== undefined ? { Menge: a.value, Einheit: a.unit || '' } : { Menge: null, Einheit: '' };
}
function beerjsonToMmum(j) {
  var W = [], recs = (j.beerjson && j.beerjson.recipes) || [];
  if (!recs.length) throw new Error(tx('In der BeerJSON-Datei wurde kein Rezept gefunden.','No recipe was found in the BeerJSON file.'));
  if (recs.length > 1) W.push(tx('Die Datei enthält ','The file contains ') + recs.length + tx(' Rezepte. Übernommen wurde das erste: „',' recipes. The first one was imported: “') + recs[0].name + '“.');
  var r = recs[0], ing = r.ingredients || {};
  var o = { Rezeptquelle: 'BeerJSON-Datei', ExportVersion: 'BeerJSON ' + (j.beerjson.version || '1.0'), Name: r.name || '', Datum: r.created || '', Sorte: (r.style && r.style.name) || '', Autor: r.author || '',
    Malze: [], Rasten: [], Hopfenkochen: [], Gewuerze_etc: [], Stopfhopfen: [], WeitereZutatGaerung: [] };
  if (r.type && r.type !== 'all grain') W.push(tx('Rezepttyp „','Recipe type “') + r.type + tx('“: Die App ist für Rezepte mit Maischen ausgelegt. Extrakt-Anteile prüfen.','”: the app is designed for all-grain recipes with a mash. Check the extract portions.'));
  var batch = bjVolL(r.batch_size); o.Ausschlagwuerze = batch !== null ? r1(batch, 1) : null;
  if (batch !== null) W.push(tx('BeerJSON nennt die Chargengröße (meist Menge im Gärbehälter). Sie wird als Ausschlagwürze verwendet.','BeerJSON states the batch size (usually the volume in the fermenter). It is used as the batch volume here.'));
  o.Sudhausausbeute = r.efficiency && r.efficiency.brewhouse ? r.efficiency.brewhouse.value : null;
  var og = bjPlato(r.original_gravity); o.Stammwuerze = og !== null ? r1(og, 1) : null;
  o.Bittere = r.ibu_estimate && r.ibu_estimate.value !== undefined ? r.ibu_estimate.value : null;
  var ebc = bjEBC(r.color_estimate); o.Farbe = ebc !== null ? r1(ebc, 0) : null;
  o.Alkohol = r.alcohol_by_volume ? r.alcohol_by_volume.value : null;
  if (typeof r.carbonation === 'number') o.Karbonisierung = r1(r.carbonation > 4.5 ? r.carbonation : r.carbonation * CO2_GL_PER_VOL, 1);
  o.Anmerkung_Autor = r.notes || ''; o.Kurzbeschreibung = r.taste && r.taste.notes ? r.taste.notes : '';
  o.Kochzeit_Wuerze = r.boil ? bjMin(r.boil.boil_time) : null;
  var maltKg = 0;
  (ing.fermentable_additions || []).forEach(function (f) {
    var use = f.timing && f.timing.use, g = bjMassG(f.amount), q = bjAmount(f.amount), name = f.name || 'Zutat';
    var isGrain = (f.type === 'grain' || !f.type) && !SUGARISH.test(name);
    if ((use === 'add_to_mash' || !use) && isGrain) { o.Malze.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit }); if (g) maltKg += g / 1000; }
    else if (use === 'add_to_fermentation' || use === 'add_to_package') o.WeitereZutatGaerung.push({ Name: name + (use === 'add_to_package' ? tx(' (beim Abfüllen)',' (at bottling)') : ''), Menge: q.Menge, Einheit: q.Einheit });
    else if (use === 'add_to_mash') { o.Malze.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit }); W.push('„' + name + tx('“ kommt laut Rezept in die Maische.','” goes into the mash according to the recipe.')); }
    else { var d = f.timing ? bjMin(f.timing.duration) : null; o.Gewuerze_etc.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit, Kochzeit: d !== null ? d : 0 }); if (d === null) W.push('„' + name + tx('“: kein Zeitpunkt in der Datei. Eingeplant bei Kochende, bitte im Original prüfen.','”: no time given in the file. Scheduled for the end of the boil, please check the original.')); }
  });
  (ing.hop_additions || []).forEach(function (h) {
    var tm = h.timing || {}, use = tm.use, g = bjMassG(h.amount), a = h.alpha_acid ? h.alpha_acid.value : null, name = h.name || tx('Hopfen','Hops');
    var d = bjMin(tm.duration); if (d === null) d = bjMin(tm.time);
    if (use === 'add_to_fermentation' || use === 'add_to_package') { o.Stopfhopfen.push({ Sorte: name, Menge: g !== null ? r1(g, 1) : null }); var dd = bjDays(tm.time); if (dd !== null) W.push(tx('Hopfenstopfen „','Dry hop “') + name + tx('“: laut Datei an Tag ','”: according to the file on day ') + r1(dd, 0) + tx(' der Gärung',' of fermentation') + (tm.duration ? ', ' + r1(bjDays(tm.duration), 0) + ' Tage' : '') + '.'); }
    else if (use === 'add_to_mash') { o.Hopfenkochen.push({ Sorte: name, Menge: g !== null ? r1(g, 1) : null, Alpha: a, Zeit: 0, Typ: 'Vorderwuerze' }); W.push(tx('Hopfen „','Hop “') + name + tx('“ (add_to_mash) wird als Vorderwürzehopfen eingeplant. Bitte im Original prüfen.','” (add_to_mash) is scheduled as a first wort hop. Please check the original.')); }
    else o.Hopfenkochen.push({ Sorte: name, Menge: g !== null ? r1(g, 1) : null, Alpha: a, Zeit: d !== null ? d : 0, Typ: 'Standard' });
  });
  (ing.miscellaneous_additions || []).forEach(function (m) {
    var tm = m.timing || {}, use = tm.use, q = bjAmount(m.amount), name = m.name || 'Zutat', d = bjMin(tm.duration);
    if (use === 'add_to_boil') o.Gewuerze_etc.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit, Kochzeit: d !== null ? d : 0 });
    else if (use === 'add_to_fermentation' || use === 'add_to_package') o.WeitereZutatGaerung.push({ Name: name + (use === 'add_to_package' ? tx(' (beim Abfüllen)',' (at bottling)') : ''), Menge: q.Menge, Einheit: q.Einheit });
    else W.push('„' + name + '“ (' + (use || tx('ohne Angabe','not specified')) + '): ' + (q.Menge !== null ? q.Menge + ' ' + q.Einheit : '') + tx('. Wird nicht als Schritt angezeigt, bitte selbst einplanen (z. B. Wasseraufbereitung).','. Not shown as a step, please plan it yourself (e.g. water treatment).'));
  });
  var c = (ing.culture_additions || [])[0];
  if (c) {
    var extra = [c.producer, c.product_id].filter(function (x) { return x && (c.name || '').toLowerCase().indexOf(String(x).toLowerCase()) < 0; });
    o.Hefe = (c.name || tx('Hefe','Yeast')) + (extra.length ? ' (' + extra.join(' ') + ')' : '');
    o.Endvergaerungsgrad = c.attenuation ? c.attenuation.value : (r.apparent_attenuation ? r.apparent_attenuation.value : null);
  }
  var fs = (r.fermentation && r.fermentation.fermentation_steps) || [], ft = [];
  fs.forEach(function (s) { var a1 = bjTempC(s.start_temperature), a2 = bjTempC(s.end_temperature); if (a1 !== null) ft.push(a1); if (a2 !== null) ft.push(a2); });
  if (ft.length) { var lo = Math.min.apply(null, ft), hi = Math.max.apply(null, ft); o.Gaertemperatur = lo === hi ? String(r1(lo, 0)) : r1(lo, 0) + '-' + r1(hi, 0); }
  var ms = (r.mash && r.mash.mash_steps) || [], first = true, sparge = 0;
  ms.forEach(function (s) {
    var ty = (s.type || '').toLowerCase(), temp = bjTempC(s.step_temperature), time = bjMin(s.step_time) || 0, amt = bjVolL(s.amount);
    if (ty === 'sparge') { if (amt) sparge += amt; return; }
    if (ty === 'drain mash tun') return;
    if (first) { o.Hauptguss = amt !== null ? r1(amt, 1) : null; var it = bjTempC(s.infuse_temperature); o.Einmaischtemperatur = it !== null ? r1(it, 0) : null; first = false; }
    else if (ty === 'infusion' && amt) W.push(tx('Rast „','Rest “') + (s.name || '') + tx('“: Das Original gibt ','”: the original adds ') + r1(amt, 1) + tx(' L heißes Wasser zu. Die App heizt stattdessen auf ',' L of hot water. The app heats to ') + r1(temp, 0) + ' °C.');
    if (ty === 'decoction') W.push(tx('Rast „','Rest “') + (s.name || '') + tx('“ ist im Original eine Dekoktion. Die Teilmaische wird nicht beschrieben, die App plant eine normale Rast.','” is a decoction in the original. The decoction is not described, so the app plans a normal rest.'));
    if (temp !== null) o.Rasten.push({ Temperatur: r1(temp, 1), Zeit: time });
  });
  if (o.Rasten.length) { var last = o.Rasten[o.Rasten.length - 1]; if (last.Temperatur >= 75) o.Abmaischtemperatur = last.Temperatur; }
  if (o.Einmaischtemperatur === null && o.Rasten.length) W.push(tx('Die Einmaischtemperatur fehlt in der Datei. Erhitze das Wasser etwa 3–5 °C über die erste Rast.','The mash-in temperature is missing in the file. Heat the water to about 3–5 °C above the first rest.'));
  if (sparge > 0) o.Nachguss = r1(sparge, 1);
  else if (o.Hauptguss && r.boil && r.boil.pre_boil_size) {
    var pb = bjVolL(r.boil.pre_boil_size), ng = pb - o.Hauptguss + maltKg;
    o.Nachguss = ng > 0 ? r1(ng, 1) : null;
    W.push(tx('Nachguss geschätzt aus Pfannevollwürze (','Sparge water estimated from the pre-boil volume (') + r1(pb, 1) + tx(' L) − Hauptguss + 1 L je kg Malz Treberverlust. Mit deiner Anlage abgleichen.',' L) − strike water + 1 L per kg of malt absorbed by the grain. Check against your own equipment.'));
  }
  return { obj: o, warnings: W, format: 'BeerJSON' };
}

/* ---------- Skalierung ---------- */
function scaleRecipe(R, f) {
  var S = JSON.parse(JSON.stringify(R));
  if (!f || f === 1) { S.factor = 1; return S; }
  S.factor = f;
  function sc(v) { return v === null ? null : v * f; }
  S.batchL = sc(S.batchL); S.mainWater = sc(S.mainWater); S.spargeWater = sc(S.spargeWater);
  S.malts.forEach(function (m) { m.amount = sc(m.amount); });
  S.hops.forEach(function (h) { h.amount = sc(h.amount); });
  S.boilAdds.forEach(function (z) { z.amount = sc(z.amount); });
  S.dryHops.forEach(function (h) { h.amount = sc(h.amount); });
  S.fermAdds.forEach(function (z) { z.amount = sc(z.amount); });
  S.decoctions.forEach(function (d) { d.volume = sc(d.volume); });
  return S;
}

function maltTotalKg(R) {
  return R.malts.reduce(function (s, m) {
    var u = m.unit.toLowerCase();
    return s + (u === 'g' ? m.amount / 1000 : u === 'kg' ? m.amount : 0);
  }, 0);
}
function pitchTemp(R) {
  var m = R.fermTemp.match(/\d+([.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}
function maxFermTemp(R) {
  var m = (R.fermTemp || '').match(/\d+([.,]\d+)?/g);
  return m ? Math.max.apply(null, m.map(function (x) { return parseFloat(x.replace(',', '.')); })) : null;
}
function restName(t) {
  if (t <= 44) return tx('Glucanaserast','Beta-glucan rest');
  if (t <= 55) return tx('Eiweißrast','Protein rest');
  if (t <= 65) return tx('Maltoserast','Maltose rest');
  if (t <= 69) return tx('Kombirast','Combined rest');
  if (t <= 75) return tx('Verzuckerungsrast','Saccharification rest');
  return tx('Abmaischrast','Mash-out rest');
}
function hopLabel(h) { return fmtAmount(h.amount, 'g') + ' ' + h.name + (h.alpha !== null ? ' (' + fmtNum(h.alpha, 1) + ' % α)' : ''); }
function addLabel(z) { return (z.amount !== null ? fmtAmount(z.amount, z.unit) + ' ' : '') + z.name; }

var PHASE_KEYS = ['prep', 'mash', 'lauter', 'boil', 'whirl', 'pitch', 'ferm'];
function phaseName(key) { var P = PHASES_(); for (var i = 0; i < P.length; i++) if (P[i].key === key) return P[i].name; return key; }
function PHASES_() { return [
  { key: 'prep', name: tx('Vorbereitung','Preparation') },
  { key: 'mash', name: tx('Maischen','Mashing') },
  { key: 'lauter', name: tx('Läutern','Lautering') },
  { key: 'boil', name: tx('Kochen','Boil') },
  { key: 'whirl', name: tx('Whirlpool & Kühlen','Whirlpool & cooling') },
  { key: 'pitch', name: tx('Anstellen','Pitching') },
  { key: 'ferm', name: tx('Gärung & Abfüllen','Fermentation & bottling') }
]; }

/* ---------- Schrittgenerator ---------- */
function buildSteps(R) {
  var S = [];
  var n = 0;
  function add(o) { o.id = o.id || ('s' + (++n)); o.checks = o.checks || []; o.items = o.items || []; o.info = o.info || []; S.push(o); return o; }
  var T = function (v, label, mode) { return { value: v, label: label, mode: mode }; };
  var mashOut = R.mashOutTemp;
  var spargeT = mashOut; // Nachgusstemperatur = Abmaischtemperatur laut Rezept
  var fwh = R.hops.filter(function (h) { return h.type === 'fwh'; });
  var wph = R.hops.filter(function (h) { return h.type === 'whirlpool'; });
  var kg = maltTotalKg(R);
  var pT = pitchTemp(R);
  var pMax = maxFermTemp(R);
  var TM = function (v, label, mode) { var o = T(v, label, mode); o.max = true; return o; };
  var ferm = R.fermTemp ? R.fermTemp.replace(/\s*-\s*/g, '–') : '';

  /* --- Vorbereitung --- */
  var hopItems = [];
  fwh.forEach(function (h) { hopItems.push({ label: tx('Vorderwürze','First wort'), value: hopLabel(h) }); });
  R.hops.filter(function (h) { return h.type === 'boil'; }).sort(function (a, b) { return b.time - a.time; })
    .forEach(function (h) { hopItems.push({ label: Math.min(h.time, R.boilTime) + ' min', value: hopLabel(h) }); });
  wph.forEach(function (h) { hopItems.push({ label: 'Whirlpool', value: hopLabel(h) }); });
  var prepItems = R.malts.map(function (m) { return { label: tx('Malz','Malt'), value: fmtAmount(m.amount, m.unit) + ' ' + m.name }; })
    .concat(hopItems.map(function (h) { return { label: tx('Hopfen ','Hops ') + h.label, value: h.value }; }))
    .concat(R.boilAdds.map(function (z) { return { label: tx('Zutat ','Addition ') + Math.min(z.time, R.boilTime) + ' min', value: addLabel(z) }; }))
    .concat(R.yeast ? [{ label: tx('Hefe','Yeast'), value: R.yeast }] : []);
  add({ phase: 'prep', title: tx('Zutaten abwiegen','Weigh out the ingredients'), temp: T(null, tx('Noch nicht heizen','Do not heat yet'), 'off'), stir: 'off',
    do: tx('Wiege alle Zutaten ab und stelle sie in der Reihenfolge der Zugabe bereit. Jede Hopfengabe einzeln abwiegen und beschriften.','Weigh out all ingredients and line them up in the order they are added. Weigh and label each hop addition separately.'),
    items: prepItems,
    checks: [tx('Malz ist geschrotet','Malt is crushed'), tx('Alle Hopfengaben einzeln abgewogen und beschriftet','All hop additions weighed and labelled separately')] });
  add({ phase: 'prep', title: tx('Geräte bereitstellen','Set up the equipment'), temp: T(null, tx('Noch nicht heizen','Do not heat yet'), 'off'), stir: 'off',
    do: tx('Stelle die Geräte bereit, die du für den Brautag brauchst.','Set up the equipment you need for the brew day.'),
    checks: [tx('Einkochtopf sauber, Rührwerk montiert (falls vorhanden)','Brew kettle clean, stirrer fitted (if you have one)'), tx('Thermometer, Jodlösung und weißer Teller bereit','Thermometer, iodine solution and white plate ready'),
      tx('Läuterbottich mit Läuterhexe/Läuterblech bereit, Hahn geschlossen','Lauter tun with lauter helix or false bottom ready, tap closed'), tx('Zweiter Topf oder Wasserkocher für ','Second pot or electric kettle ready for ') + fmtL(R.spargeWater) + tx(' Nachguss bereit',' of sparge water'),
      tx('Gärbehälter gereinigt, Desinfektionsmittel bereit','Fermenter cleaned, sanitiser ready')] });
  add({ phase: 'prep', title: tx('Hauptguss einfüllen','Fill in the strike water'), temp: T(null, tx('Noch nicht heizen','Do not heat yet'), 'off'), stir: 'off',
    do: tx('Fülle ','Fill ') + fmtL(R.mainWater) + tx(' Wasser (Hauptguss) in den Einkochtopf.',' of water (strike water) into the brew kettle.'),
    items: [{ label: tx('Hauptguss','Strike water'), value: fmtL(R.mainWater) }] });
  add({ phase: 'prep', title: tx('Hauptguss auf ','Heat strike water to ') + fmtT(R.mashInTemp) + tx(' erhitzen',''), temp: T(R.mashInTemp, tx('Wasser · Einmaischtemperatur','Water · mash-in temperature'), 'heat'), stir: 'off',
    do: tx('Stelle den Einkochtopf auf ','Set the brew kettle to ') + fmtT(R.mashInTemp) + tx(' und heize den Hauptguss auf. Bestätige, wenn das Wasser ',' and heat the strike water. Confirm when the water is at ') + fmtT(R.mashInTemp) + tx(' hat.','.'),
    info: [tx('Die Einmaischtemperatur bei maischemalzundmehr.de ist die Wassertemperatur. Nach der Malzzugabe fällt die Temperatur um etwa 3–5 °C.','At maischemalzundmehr.de the mash-in temperature is the water temperature. After adding the malt the temperature drops by about 3–5 °C.')] });

  /* --- Maischen --- */
  add({ phase: 'mash', title: tx('Einmaischen','Mash in'), temp: T(R.mashInTemp, tx('Maische','Mash'), 'hold'), stir: 'on',
    do: tx('Rührwerk einschalten. Schütte das Malz (','Switch on the stirrer. Slowly pour in the malt (') + fmtNum(kg, 2) + tx(' kg) langsam ein und rühre, bis keine Klumpen mehr da sind. Einkochtopf bleibt auf ',' kg) and stir until there are no lumps left. Keep the brew kettle set to ') + fmtT(R.mashInTemp) + '.',
    items: R.malts.map(function (m) { return { label: tx('Malz','Malt'), value: fmtAmount(m.amount, m.unit) + ' ' + m.name }; }) });

  // Maisch-Ereignisse in Reihenfolge (Rast ohne Zeit bei Abmaischtemperatur = Abmaischen, wird unten erzeugt)
  var events = [];
  var rests = R.rests.filter(function (r) { return !(r.time <= 0 && r.temp >= mashOut - 0.4); });
  if (R.decoctions.length) {
    var firstRes = R.decoctions[0].tempResult !== null ? R.decoctions[0].tempResult : Infinity;
    var pre = [], post = [];
    rests.forEach(function (r) { (r.temp < firstRes ? pre : post).push(r); });
    pre.forEach(function (r) { events.push({ kind: 'rest', r: r }); });
    R.decoctions.forEach(function (d) { events.push({ kind: 'dec', d: d }); });
    post.forEach(function (r) { events.push({ kind: 'rest', r: r }); });
  } else {
    rests.forEach(function (r) { events.push({ kind: 'rest', r: r }); });
  }
  var effT = function (e) { return e.kind === 'rest' ? e.r.temp : (e.d.tempResult !== null ? e.d.tempResult : 0); };
  var jodEvt = -1;
  events.forEach(function (e, i) { if (effT(e) < 76) jodEvt = i; });
  if (jodEvt < 0 && events.length) jodEvt = events.length - 1;
  var spargeEvt = Math.max(0, jodEvt - 1);
  var spargeCheck = tx('Parallel: ','Meanwhile: heat ') + fmtL(R.spargeWater) + tx(' Nachguss im zweiten Topf/Wasserkocher auf ',' of sparge water in a second pot or electric kettle to ') + fmtT(spargeT) + tx(' erhitzen und warm halten',' and keep it warm');
  var curT = R.mashInTemp;
  var restNo = 0, decNo = 0, lastRestStep = null, jodRestStep = null;

  events.forEach(function (e, i) {
    var lastStepOfEvent = null;
    if (e.kind === 'rest') {
      var r = e.r; restNo++;
      var label = tx('Rast ','Rest ') + restNo + ' · ' + restName(r.temp);
      if (restNo === 1 && i === 0) {
        lastStepOfEvent = add({ phase: 'mash', title: tx('Maische auf ','Adjust mash to ') + fmtT(r.temp) + tx(' einstellen',''), temp: T(r.temp, tx('Maische · ','Mash · ') + label, 'heat'), stir: 'on',
          do: tx('Stelle den Einkochtopf auf ','Set the brew kettle to ') + fmtT(r.temp) + tx('. Miss die Maischetemperatur. Ist sie niedriger: heizen und rühren. Ist sie höher: ohne Deckel rühren, bis ','. Measure the mash temperature. If it is lower: heat and stir. If it is higher: stir with the lid off until it reaches ') + fmtT(r.temp) + tx(' erreicht sind. Bestätige bei ','. Confirm at ') + fmtT(r.temp) + '.' });
      } else if (Math.abs(r.temp - curT) >= 0.5) {
        lastStepOfEvent = add({ phase: 'mash', title: tx('Aufheizen auf ','Heat to ') + fmtT(r.temp), temp: T(r.temp, tx('Maische · ','Mash · ') + label, r.temp > curT ? 'heat' : 'hold'), stir: 'on',
          do: tx('Stelle den Einkochtopf auf ','Set the brew kettle to ') + fmtT(r.temp) + tx(' und heize unter ständigem Rühren auf. Bestätige, wenn die Maische ',' and heat while stirring constantly. Confirm when the mash is at ') + fmtT(r.temp) + tx(' hat.','.') });
      }
      if (r.time > 0) {
        lastStepOfEvent = add({ phase: 'mash', title: tx('Rast ','Rest ') + restNo + ': ' + fmtT(r.temp) + ' · ' + fmtNum(r.time, 1) + ' min', sub: restName(r.temp),
          temp: T(r.temp, tx('Maische halten · ','Hold mash · ') + label, 'hold'), stir: 'on',
          do: tx('Halte die Maische ','Hold the mash for ') + fmtNum(r.time, 1) + tx(' Minuten auf ',' minutes at ') + fmtT(r.temp) + tx('. Rührwerk laufen lassen (von Hand: alle 5 Minuten umrühren).','. Leave the stirrer running (by hand: stir every 5 minutes).'),
          timer: { kind: 'rest', minutes: r.time, label: tx('Rast ','Rest ') + restNo } });
        lastRestStep = lastStepOfEvent;
      }
      curT = r.temp;
    } else {
      var d = e.d; decNo++;
      var dn = tx('Dekoktion ','Decoction ') + decNo;
      var hold = d.tempIs !== null ? d.tempIs : curT;
      lastStepOfEvent = add({ phase: 'mash', title: dn + tx(': Teilmaische ziehen',': pull the decoction'), temp: T(hold, tx('Hauptmaische halten (Einkochtopf)','Hold main mash (brew kettle)'), 'hold'), stir: 'on',
        do: tx('Entnimm ','Remove ') + fmtL(d.volume) + (d.form ? ' ' + d.form : tx(' Teilmaische',' of decoction mash')) + tx(' aus dem Einkochtopf in den zweiten Topf. Die Hauptmaische bleibt bei ',' from the brew kettle into the second pot. The main mash stays at ') + fmtT(hold) + tx(', Rührwerk an.',', stirrer on.'),
        items: [{ label: tx('Teilmaische','Decoction'), value: fmtL(d.volume) + (d.form ? ' (' + d.form + ')' : '') }],
        info: [tx('Dickmaische: vor allem Malz mit wenig Flüssigkeit schöpfen. Dünnmaische: vor allem Flüssigkeit.','Thick mash: scoop mainly grain with little liquid. Thin mash: mainly liquid.')] });
      if (d.partTemp !== null && d.partRestTime > 0) {
        add({ phase: 'mash', title: dn + tx(': Teilmaische auf ',': heat decoction to ') + fmtT(d.partTemp), temp: T(d.partTemp, tx('Teilmaische (zweiter Topf)','Decoction (second pot)'), 'heat'), stir: 'on',
          do: tx('Heize die Teilmaische im zweiten Topf unter ständigem Rühren auf ','Stirring constantly, heat the decoction in the second pot to ') + fmtT(d.partTemp) + tx('. Hauptmaische weiter auf ','. Keep the main mash at ') + fmtT(hold) + tx(' halten.','.') });
        add({ phase: 'mash', title: dn + tx(': Teilmaische ',': decoction ') + fmtNum(d.partRestTime, 1) + tx(' min bei ',' min at ') + fmtT(d.partTemp), temp: T(d.partTemp, tx('Teilmaische halten (zweiter Topf)','Hold decoction (second pot)'), 'hold'), stir: 'on',
          do: tx('Halte die Teilmaische ','Hold the decoction for ') + fmtNum(d.partRestTime, 1) + tx(' Minuten auf ',' minutes at ') + fmtT(d.partTemp) + tx(' und rühre regelmäßig.',' and stir regularly.'),
          timer: { kind: 'rest', minutes: d.partRestTime, label: tx('Teilmaische-Rast','Decoction rest') } });
      }
      if (d.partBoilTime > 0) {
        add({ phase: 'mash', title: dn + tx(': Teilmaische zum Kochen bringen',': bring decoction to the boil'), temp: T(100, tx('Teilmaische (zweiter Topf)','Decoction (second pot)'), 'boil'), stir: 'on',
          do: tx('Bringe die Teilmaische unter ständigem Rühren zum Kochen. Sie brennt leicht an: nicht aufhören zu rühren.','Bring the decoction to the boil while stirring constantly. It scorches easily: do not stop stirring.') });
        add({ phase: 'mash', title: dn + tx(': Teilmaische ',': decoction ') + fmtNum(d.partBoilTime, 1) + tx(' min kochen',' min boil'), temp: T(100, tx('Teilmaische kochen (zweiter Topf)','Boil decoction (second pot)'), 'boil'), stir: 'on',
          do: tx('Koche die Teilmaische ','Boil the decoction for ') + fmtNum(d.partBoilTime, 1) + tx(' Minuten unter ständigem Rühren.',' minutes, stirring constantly.'),
          timer: { kind: 'rest', minutes: d.partBoilTime, label: tx('Teilmaische kochen','Boil decoction') } });
      }
      lastStepOfEvent = add({ phase: 'mash', title: dn + tx(': zurück zur Hauptmaische',': back to the main mash'), temp: T(d.tempResult, tx('Gesamtmaische · Ziel','Whole mash · target'), 'hold'), stir: 'on',
        do: tx('Gib die Teilmaische langsam unter Rühren zurück in den Einkochtopf. Ziel: ','Slowly return the decoction to the brew kettle while stirring. Target: ') + fmtT(d.tempResult) + tx('. Stelle den Einkochtopf auf ','. Set the brew kettle to ') + fmtT(d.tempResult) + tx(' und korrigiere, bis die Maische ',' and adjust until the mash is at ') + fmtT(d.tempResult) + tx(' hat.','.') });
      if (d.restTime > 0) {
        lastStepOfEvent = add({ phase: 'mash', title: dn + tx(': Rast ',': rest ') + fmtT(d.tempResult) + ' · ' + fmtNum(d.restTime, 1) + ' min', sub: restName(d.tempResult),
          temp: T(d.tempResult, tx('Maische halten','Hold mash'), 'hold'), stir: 'on',
          do: tx('Halte die Maische ','Hold the mash for ') + fmtNum(d.restTime, 1) + tx(' Minuten auf ',' minutes at ') + fmtT(d.tempResult) + tx('. Rührwerk laufen lassen.','. Leave the stirrer running.'),
          timer: { kind: 'rest', minutes: d.restTime, label: dn + tx(' Rast',' rest') } });
        lastRestStep = lastStepOfEvent;
      }
      if (d.tempResult !== null) curT = d.tempResult;
    }
    if (i === spargeEvt && lastStepOfEvent) lastStepOfEvent.checks.push(spargeCheck);
    if (i === jodEvt) {
      jodRestStep = lastRestStep;
      add({ phase: 'mash', title: tx('Jodprobe','Iodine test'), temp: T(curT, tx('Maische halten','Hold mash'), 'hold'), stir: 'on', jod: true, jodRest: lastRestStep ? lastRestStep.id : null,
        do: tx('Gib etwas Maische (ohne Spelzen) auf einen weißen Teller und tropfe 1–2 Tropfen Jod darauf. Gelb bis braun = jodnormal. Blau, violett oder schwarz = noch Stärke vorhanden.','Put a little mash liquid (without husks) on a white plate and add 1–2 drops of iodine. Yellow to brown = conversion complete (iodine-negative). Blue, violet or black = starch is still present.'),
        checks: [tx('Probe ist jodnormal (keine Blaufärbung)','Sample is iodine-negative (no blue colour)')],
        info: [tx('Nicht jodnormal? Tippe auf „Rast +10 min“. Die App geht zurück zur letzten Rast und verlängert sie.','Not iodine-negative? Tap “Rest +10 min”. The app goes back to the last rest and extends it.')] });
    }
  });
  if (!events.length) S[S.length - 1].checks.push(spargeCheck);

  if (curT < mashOut - 0.4) {
    add({ phase: 'mash', title: tx('Abmaischen: auf ','Mash out: heat to ') + fmtT(mashOut) + tx(' aufheizen',''), temp: T(mashOut, tx('Maische · Abmaischtemperatur','Mash · mash-out temperature'), 'heat'), stir: 'on',
      do: tx('Stelle den Einkochtopf auf ','Set the brew kettle to ') + fmtT(mashOut) + tx(' und heize unter Rühren auf. Bestätige, wenn die Maische ',' and heat while stirring. Confirm when the mash is at ') + fmtT(mashOut) + tx(' hat. Nicht über 80 °C.','. Do not exceed 80 °C.') });
  } else {
    add({ phase: 'mash', title: tx('Abmaischtemperatur ','Check mash-out temperature ') + fmtT(mashOut) + tx(' prüfen',''), temp: T(mashOut, tx('Maische · Abmaischtemperatur','Mash · mash-out temperature'), 'hold'), stir: 'on',
      do: tx('Miss die Maischetemperatur. Sie muss ','Measure the mash temperature. It must be ') + fmtT(mashOut) + tx(' haben. Danach geht es zum Läutern.','. Lautering comes next.') });
  }

  /* --- Läutern --- */
  var lTemp = T(spargeT, tx('Nachguss (zweiter Topf)','Sparge water (second pot)'), 'hold');
  add({ phase: 'lauter', title: tx('Maische in den Läuterbottich','Transfer mash to the lauter tun'), temp: T(null, tx('Einkochtopf AUS','Brew kettle OFF'), 'off'), stir: 'off',
    do: tx('Schalte Einkochtopf und Rührwerk aus. Fülle die gesamte Maische in den Läuterbottich (Hahn geschlossen).','Switch off the brew kettle and the stirrer. Transfer the whole mash to the lauter tun (tap closed).') });
  add({ phase: 'lauter', title: tx('Läuterruhe 15 min','Lauter rest 15 min'), temp: lTemp, stir: 'off',
    do: tx('Nicht rühren. Der Treber setzt sich und bildet den Filterkuchen.','Do not stir. The spent grains settle and form the filter bed.'),
    timer: { kind: 'rest', minutes: 15, label: tx('Läuterruhe','Lauter rest') },
    checks: [tx('Einkochtopf ausgespült und unter den Läuterhahn gestellt (Läuterbottich steht höher)','Brew kettle rinsed and placed under the lauter tap (lauter tun stands higher)'), tx('Nachguss hat ','Sparge water is at ') + fmtT(spargeT)],
    info: [tx('Die Nachgusstemperatur entspricht der Abmaischtemperatur aus dem Rezept.','The sparge water temperature equals the mash-out temperature from the recipe.')] });
  if (fwh.length) {
    add({ phase: 'lauter', title: tx('Vorderwürzehopfen vorlegen','Add the first wort hops'), temp: lTemp, stir: 'off',
      do: tx('Gib den Vorderwürzehopfen in den leeren Einkochtopf, bevor die Würze hineinläuft.','Put the first wort hops into the empty brew kettle before the wort runs in.'),
      items: fwh.map(function (h) { return { label: tx('Vorderwürze','First wort'), value: hopLabel(h) }; }),
      checks: fwh.map(function (h) { return hopLabel(h) + tx(' im Einkochtopf',' in the brew kettle'); }) });
  }
  add({ phase: 'lauter', title: tx('Trübwürze zurückführen','Recirculate the cloudy wort (vorlauf)'), temp: lTemp, stir: 'off',
    do: tx('Öffne den Läuterhahn langsam. Fange die trüben ersten Liter in einem Messbecher auf und gieße sie vorsichtig zurück auf den Treber, bis die Würze klar läuft.','Open the lauter tap slowly. Collect the cloudy first litres in a measuring jug and pour them gently back onto the grain bed until the wort runs clear.'),
    info: [tx('Über einen Löffel zurückgießen, damit der Treberkuchen nicht aufgewühlt wird.','Pour back over a spoon so that the grain bed is not disturbed.')] });
  add({ phase: 'lauter', title: tx('Vorderwürze ablaufen lassen','Run off the first wort'), temp: lTemp, stir: 'off',
    do: tx('Lass die klare Würze in den Einkochtopf laufen, bis die Flüssigkeit nur noch knapp über dem Treber steht. Der Treber darf nie trockenfallen.','Let the clear wort run into the brew kettle until the liquid is only just above the grain bed. The grain bed must never run dry.') });
  add({ phase: 'lauter', title: tx('Nachguss aufgießen: ','Sparge: ') + fmtL(R.spargeWater), temp: lTemp, stir: 'off',
    do: tx('Gieße die ','Pour on the ') + fmtL(R.spargeWater) + tx(' Nachguss (',' of sparge water (') + fmtT(spargeT) + tx(') portionsweise auf. Es sollen immer 1–2 cm Flüssigkeit über dem Treber stehen. Läutere, bis der gesamte Nachguss durchgelaufen ist.',') in portions. There should always be 1–2 cm of liquid above the grain bed. Keep lautering until all the sparge water has run through.'),
    items: [{ label: tx('Nachguss','Sparge water'), value: fmtL(R.spargeWater) + tx(' bei ',' at ') + fmtT(spargeT) }],
    checks: [tx('Einkochtopf auf Kochstufe gestellt, sobald das Heizelement bedeckt ist','Brew kettle set to boil as soon as the heating element is covered'), tx('Gesamter Nachguss durchgelaufen, Läuterhahn geschlossen','All sparge water has run through, lauter tap closed')],
    info: [tx('Stockt der Ablauf: Treberoberfläche vorsichtig mit einem Messer einschneiden, nicht umrühren.','If the run-off stalls: carefully score the surface of the grain bed with a knife, do not stir.')] });

  /* --- Kochen --- */
  var B = R.boilTime;
  var groups = {};
  function grp(t) { var k = t >= B ? B : (t <= 0 ? 0 : t); groups[k] = groups[k] || []; return groups[k]; }
  R.hops.filter(function (h) { return h.type === 'boil'; }).forEach(function (h) { grp(h.time).push({ label: tx('Hopfen','Hops'), value: hopLabel(h) }); });
  R.boilAdds.forEach(function (z) { grp(z.time).push({ label: tx('Zutat','Addition'), value: addLabel(z) }); });
  var times = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; });
  var SUGAR = /zucker|kandis|candi|honig|sirup|malzextrakt|laktose|lactose|dextrose|glukose|glucose|melasse/i;
  function hasSugar(items) { return items.some(function (it) { return SUGAR.test(it.value); }); }
  var SUGAR_TXT = tx(' Zucker langsam unter Rühren einrieseln lassen und weiterrühren, bis er sich ganz gelöst hat. Sonst sinkt er zu Boden und brennt am Heizboden an.',' Sprinkle the sugar in slowly while stirring and keep stirring until it has dissolved completely. Otherwise it sinks to the bottom and scorches on the heating plate.');

  add({ phase: 'boil', title: tx('Zum Kochen bringen','Bring to the boil'), temp: T(100, tx('Würze · Kochen','Wort · boil'), 'boil'), stir: 'off',
    do: tx('Einkochtopf auf höchste Stufe. Zum Aufheizen darf der Deckel drauf. Sobald die Würze kocht: Deckel abnehmen. Bestätige, wenn die Würze sprudelnd kocht und der Deckel ab ist.','Brew kettle on the highest setting. The lid may stay on while heating up. As soon as the wort boils: take the lid off. Confirm when the wort is at a rolling boil and the lid is off.'),
    checks: [tx('Deckel abgenommen','Lid removed')],
    info: [tx('Beim ersten Aufwallen schäumt die Würze stark: dabeibleiben, notfalls kurz Hitze reduzieren.','The wort foams up strongly at the first boil (hot break): stay with it and briefly reduce the heat if necessary.'), tx('Während des Kochens bleibt der Topf offen, damit unerwünschte Aromastoffe (DMS) verdampfen können.','The kettle stays open during the boil so that unwanted aroma compounds (DMS) can evaporate.')] });
  var startItems = groups[B] || [];
  add({ phase: 'boil', title: tx('Kochbeginn: ','Start of boil: start ') + fmtNum(B, 0) + tx(' min Kochzeit starten',' min boil time'), temp: T(100, tx('Würze · kochen · Deckel offen','Wort · boiling · lid off'), 'boil'), stir: hasSugar(startItems) ? 'on' : 'off',
    do: (startItems.length ? tx('Gib jetzt die Gaben zu Kochbeginn in die kochende Würze.','Now add the additions for the start of the boil to the boiling wort.') + (hasSugar(startItems) ? SUGAR_TXT : '') + ' ' : '') + tx('Der Deckel bleibt während der gesamten Kochzeit offen. Mit OK startet die Kochzeit von ','The lid stays off for the entire boil. Pressing OK starts the boil time of ') + fmtNum(B, 0) + tx(' Minuten.',' minutes.'),
    items: startItems.map(function (it) { return { label: it.label + ' · ' + fmtNum(B, 0) + ' min', value: it.value }; }),
    checks: [tx('Deckel ist ab','Lid is off')].concat(startItems.map(function (it) { return it.value + tx(' zugegeben',' added'); })),
    timer: { kind: 'boilStart', minutes: B } });
  times.forEach(function (t) {
    if (t >= B || t <= 0) return;
    var g = groups[t];
    add({ phase: 'boil', title: tx('Gabe bei noch ','Addition with ') + fmtNum(t, 1) + tx(' min Kochzeit',' min of boil remaining'), temp: T(100, tx('Würze · kochen · Deckel offen','Wort · boiling · lid off'), 'boil'), stir: hasSugar(g) ? 'on' : 'off',
      do: tx('Gib bei ','With ') + fmtNum(t, 1) + tx(' Minuten Restkochzeit zu: ',' minutes of boil remaining, add: ') + g.map(function (x) { return x.value; }).join(', ') + '.' + (hasSugar(g) ? SUGAR_TXT : '') + tx(' Deckel bleibt offen.',' Keep the lid off.'),
      items: g.map(function (it) { return { label: it.label + ' · ' + fmtNum(t, 1) + ' min', value: it.value }; }),
      checks: g.map(function (it) { return it.value + tx(' zugegeben',' added'); }),
      timer: { kind: 'boilAt', at: t } });
  });
  var endItems = groups[0] || [];
  add({ phase: 'boil', title: tx('Kochende','End of boil'), temp: T(null, tx('Deckel offen · bei 0:00 AUS','Lid off · OFF at 0:00'), 'boil'), stir: hasSugar(endItems) ? 'on' : 'off',
    do: tx('Deckel bleibt offen. Wenn die Kochzeit abgelaufen ist: Einkochtopf ausschalten.','Keep the lid off. When the boil time is up: switch off the brew kettle.') + (endItems.length ? tx(' Dann sofort die Gaben bei Kochende zugeben.',' Then add the end-of-boil additions straight away.') + (hasSugar(endItems) ? SUGAR_TXT : '') : ''),
    items: endItems.map(function (it) { return { label: it.label + ' · 0 min', value: it.value }; }),
    checks: [tx('Einkochtopf ausgeschaltet','Brew kettle switched off')].concat(endItems.map(function (it) { return it.value + tx(' zugegeben',' added'); })),
    timer: { kind: 'boilEnd' } });

  /* --- Whirlpool & Kühlen --- */
  var wpTime = 15, wpFromRecipe = false;
  wph.forEach(function (h) { if (h.time && h.time > 0) { wpTime = Math.max(wpFromRecipe ? wpTime : 0, h.time); wpFromRecipe = true; } });
  if (wph.length) {
    add({ phase: 'whirl', title: tx('Whirlpoolhopfen zugeben','Add the whirlpool hops'), temp: T(null, tx('Einkochtopf AUS','Brew kettle OFF'), 'off'), stir: 'off',
      do: tx('Gib den Whirlpoolhopfen direkt nach Kochende in die heiße Würze.','Add the whirlpool hops to the hot wort straight after the end of the boil.'),
      items: wph.map(function (h) { return { label: 'Whirlpool', value: hopLabel(h) }; }),
      checks: wph.map(function (h) { return hopLabel(h) + tx(' zugegeben',' added'); }),
      info: [tx('Der Rezept-Export nennt keine Temperatur für den Whirlpoolhopfen, deshalb erfolgt die Zugabe direkt nach Kochende.','The recipe export gives no temperature for the whirlpool hops, so they are added straight after the end of the boil.')] });
  }
  add({ phase: 'whirl', title: tx('Whirlpool starten','Start the whirlpool'), temp: T(null, tx('Einkochtopf AUS','Brew kettle OFF'), 'off'), stir: 'hard',
    do: tx('Rühre die Würze 1–2 Minuten kräftig im Kreis, bis ein Strudel entsteht. Dann Löffel heraus, Deckel drauf.','Stir the wort vigorously in a circle for 1–2 minutes until a vortex forms. Then take the spoon out and put the lid on.'),
    info: [tx('Vorher 2–3 Minuten warten, bis die Würze ruhig ist. Rührwerk vorher abnehmen.','Wait 2–3 minutes beforehand until the wort is calm. Remove the stirrer first.')] });
  add({ phase: 'whirl', title: tx('Whirlpool-Ruhe ','Whirlpool rest ') + fmtNum(wpTime, 0) + ' min', temp: T(null, tx('Einkochtopf AUS','Brew kettle OFF'), 'off'), stir: 'off',
    do: tx('Nicht rühren, Topf nicht bewegen. Hopfen und Eiweiß setzen sich als Kegel in der Mitte ab.','Do not stir, do not move the kettle. Hops and protein (trub) settle as a cone in the middle.'),
    timer: { kind: 'rest', minutes: wpTime, label: tx('Whirlpool-Ruhe','Whirlpool rest') },
    info: wpFromRecipe ? [tx('Ruhezeit aus der Zeitangabe des Whirlpoolhopfens im Rezept.','Rest time taken from the time given for the whirlpool hops in the recipe.')] : [] });
  add({ phase: 'whirl', title: tx('Heiße Würze in den Gärbehälter umfüllen','Transfer the hot wort to the fermenter'), temp: T(null, tx('Einkochtopf AUS','Brew kettle OFF'), 'off'), stir: 'off',
    do: tx('Lass die heiße Würze über den Hahn langsam in den gereinigten, hitzebeständigen Gärbehälter laufen. Der Trubkegel bleibt im Topf. Schlauch bis zum Boden führen, nicht plätschern lassen.','Let the hot wort run slowly through the tap into the cleaned, heat-resistant fermenter. The trub cone stays in the kettle. Run the hose down to the bottom and avoid splashing.'),
    checks: [tx('Würze im Gärbehälter, Trubkegel im Topf geblieben','Wort is in the fermenter, trub cone left in the kettle'), tx('Gärbehälter sofort mit Deckel verschlossen','Fermenter closed with its lid straight away')],
    info: [tx('Heiße Würze nicht belüften: Sauerstoff bei hoher Temperatur fördert Fehlaromen. Belüftet wird erst nach dem Abkühlen.','Do not aerate hot wort: oxygen at high temperature promotes off-flavours. Aeration only happens after cooling.'), tx('Der Gärbehälter muss für fast kochende Würze geeignet sein (z. B. Gäreimer aus PP oder Edelstahl).','The fermenter must be suitable for near-boiling wort (e.g. a PP fermenting bucket or stainless steel).')] });
  var lager = pMax !== null && pMax < 15;
  add({ phase: 'whirl', title: tx('Abkühlen lassen','Let it cool') + (pMax !== null ? tx(' auf höchstens ',' to at most ') + fmtT(pMax) : ''), temp: TM(pMax, tx('Würze abkühlen auf höchstens','Cool wort to at most'), 'cool'), stir: 'off',
    do: tx('Lass die Würze im geschlossenen Gärbehälter abkühlen, bis sie ','Let the wort cool in the closed fermenter until it is ') + (pMax !== null ? tx('höchstens ','at most ') + fmtT(pMax) + tx(' hat (obere Grenze der Gärtemperatur laut Rezept: ',' (upper limit of the fermentation temperature in the recipe: ') + ferm + ' °C)' : tx('die Gärtemperatur laut Hefehersteller hat','at the fermentation temperature given by the yeast manufacturer')) + tx('. Ohne Kühlung dauert das meist bis zum nächsten Tag.','. Without active cooling this usually takes until the next day.'),
    items: R.fermTemp ? [{ label: tx('Gärtemperatur laut Rezept','Fermentation temperature (recipe)'), value: ferm + ' °C' }] : [],
    checks: [pMax !== null ? tx('Würze hat höchstens ','Wort is at most ') + fmtT(pMax) + tx(' (mit desinfiziertem Thermometer gemessen)',' (measured with a sanitised thermometer)') : tx('Würze hat Gärtemperatur (mit desinfiziertem Thermometer gemessen)','Wort is at fermentation temperature (measured with a sanitised thermometer)')],
    info: [tx('Deckel bis zum Anstellen geschlossen lassen. Stell den Gärbehälter an den kühlsten Ort, den du hast (Keller, Flur, im Winter draußen geschützt). Im Sommer hilft ein Wasserbad in Wanne oder Mörtelkübel mit gefrorenen Wasserflaschen.','Keep the lid closed until pitching. Put the fermenter in the coolest place you have (cellar, hallway, outdoors under cover in winter). In summer a water bath in a tub with frozen water bottles helps.')]
      .concat(lager ? [tx('Untergärige Hefe: ','Bottom-fermenting (lager) yeast: ') + ferm + tx(' °C erreichst du ohne Kühlung meist nur im kalten Keller oder im Winter. Ist es wärmer, gärt das Bier mit Fehlaromen. Plane den Brautag danach oder nimm eine obergärige Hefe.',' °C is usually only reachable without cooling in a cold cellar or in winter. If it is warmer, the beer ferments with off-flavours. Plan your brew day accordingly or use a top-fermenting (ale) yeast.')] : []) });

  /* --- Anstellen --- */
  add({ phase: 'pitch', title: tx('Stammwürze und Menge messen','Measure original gravity and volume'), temp: TM(pMax, tx('Würze höchstens','Wort at most'), 'cool'), stir: 'off', calc: 'og',
    do: tx('Nimm mit desinfiziertem Werkzeug eine Probe und miss die Stammwürze. Lies die Würzemenge am Gärbehälter ab. ','Take a sample with sanitised equipment and measure the original gravity. Read the wort volume off the fermenter. ') + (R.og !== null ? tx('Ziel laut Rezept: ','Target according to the recipe: ') + fmtNum(R.og, 1) + ' °P.' : tx('Das Rezept nennt keine Stammwürze.','The recipe does not state an original gravity.')),
    items: (R.og !== null ? [{ label: tx('Stammwürze Ziel','Original gravity target'), value: fmtNum(R.og, 1) + ' °P' }] : []).concat(R.batchL !== null ? [{ label: tx('Ausschlagwürze','Batch volume (cast-out wort)'), value: fmtL(R.batchL) + tx(' (bei 100 °C gemessen)',' (measured at 100 °C)') }] : []),
    checks: [tx('Stammwürze gemessen und notiert','Original gravity measured and noted')],
    info: [tx('Liegt die Stammwürze deutlich über dem Ziel, mit abgekochtem, abgekühltem Wasser verdünnen. Im Gärbehälter ist es weniger als die Ausschlagwürze (Trub, Verdampfung, Abkühlung).','If the original gravity is well above the target, dilute with boiled, cooled water. There is less in the fermenter than the cast-out volume (trub, evaporation, cooling shrinkage).')] });
  add({ phase: 'pitch', title: tx('Belüften und Hefe zugeben','Aerate and pitch the yeast'), temp: TM(pMax, tx('Anstelltemperatur höchstens','Pitching temperature at most'), 'cool'), stir: 'hard',
    do: tx('Belüfte zuerst die abgekühlte Würze: Gärbehälter verschlossen kräftig schwenken oder mit desinfiziertem Löffel 1–2 Minuten kräftig rühren. Gib dann die Hefe zu: ','First aerate the cooled wort: shake the closed fermenter vigorously or stir hard with a sanitised spoon for 1–2 minutes. Then pitch the yeast: ') + (R.yeast || tx('Hefe laut Rezept','yeast according to the recipe')) + tx('. Verschließe den Gärbehälter und setze das Gärröhrchen auf.','. Close the fermenter and fit the airlock.'),
    items: [{ label: tx('Hefe','Yeast'), value: R.yeast || '–' }, { label: tx('Gärtemperatur','Fermentation temperature'), value: R.fermTemp ? R.fermTemp + ' °C' : '–' }, { label: tx('Endvergärungsgrad','Attenuation'), value: R.attenuation !== null ? fmtNum(R.attenuation, 0) + ' %' : '–' }],
    checks: [tx('Würze belüftet','Wort aerated'), tx('Hefe zugegeben','Yeast pitched'), tx('Gärbehälter verschlossen, Gärröhrchen gefüllt','Fermenter closed, airlock filled')],
    info: [tx('Trockenhefe nach Herstellerangabe aufstreuen oder rehydrieren, Flüssighefe direkt zugeben.','Sprinkle dry yeast on top or rehydrate it as the manufacturer recommends; add liquid yeast directly.')] });

  /* --- Gärung & Abfüllen --- */
  var fT = T(pT, tx('Gärtemperatur laut Rezept','Fermentation temperature (recipe)'), 'hold'); if (ferm) fT.display = ferm;
  add({ phase: 'ferm', title: tx('Hauptgärung','Primary fermentation'), temp: fT, stir: 'off',
    do: tx('Stell den verschlossenen Gärbehälter an einen Ort mit möglichst gleichmäßiger Temperatur','Put the closed fermenter somewhere with a temperature that is as steady as possible') + (ferm ? tx(', ideal im Bereich ',', ideally in the range ') + ferm + ' °C' : '') + tx('. Gärbehälter nicht öffnen.','. Do not open the fermenter.'),
    items: [{ label: tx('Gärtemperatur laut Rezept','Fermentation temperature (recipe)'), value: R.fermTemp ? R.fermTemp + ' °C' : '–' }, { label: tx('Hefe','Yeast'), value: R.yeast || '–' }],
    checks: [tx('Gärung hat begonnen (Gärröhrchen blubbert, Schaumdecke)','Fermentation has started (airlock bubbling, layer of foam)')],
    info: [tx('Ohne Kühlung: Nimm den kühlsten gleichmäßigen Ort. Die Gärung selbst erwärmt das Bier um 2–4 °C. Zu warm vergoren schmeckt es leicht nach Lösungsmittel, zu kalt gärt es nur langsam.','Without cooling: choose the coolest place with a steady temperature. Fermentation itself warms the beer by 2–4 °C. Fermented too warm it tastes slightly of solvent; too cold it ferments only slowly.'), tx('Die App überwacht die Gärung nicht. Bestätige den nächsten Schritt, wenn er ansteht. Dein Fortschritt bleibt gespeichert.','The app does not monitor fermentation. Confirm the next step when it is due. Your progress stays saved.')] });

  var noteInfo = R.note ? [tx('Der Export enthält keinen Zeitpunkt. Plane die Zugabe nach der Anmerkung des Autors (Menü „Rezept“).','The export contains no time. Plan the addition according to the author\'s note (menu “Recipe”).')] : [tx('Der Export enthält keinen Zeitpunkt für diese Zugabe.','The export contains no time for this addition.')];
  R.dryHops.forEach(function (h, i) {
    add({ phase: 'ferm', title: tx('Hopfenstopfen: ','Dry hopping: ') + fmtAmount(h.amount, 'g') + ' ' + h.name, temp: T(null, tx('Gärung','Fermentation'), 'off'), stir: 'off',
      do: tx('Gib ','Add ') + fmtAmount(h.amount, 'g') + ' ' + h.name + tx(' in den Gärbehälter (Hopfenstopfen).',' to the fermenter (dry hopping).'),
      items: [{ label: tx('Stopfhopfen ','Dry hop ') + (i + 1), value: fmtAmount(h.amount, 'g') + ' ' + h.name }],
      checks: [fmtAmount(h.amount, 'g') + ' ' + h.name + tx(' zugegeben',' added')], info: noteInfo });
  });
  R.fermAdds.forEach(function (z) {
    add({ phase: 'ferm', title: tx('Zugabe zur Gärung: ','Addition during fermentation: ') + addLabel(z), temp: T(null, tx('Gärung','Fermentation'), 'off'), stir: 'off',
      do: tx('Gib ','Add ') + addLabel(z) + tx(' zum Gärbehälter.',' to the fermenter.'),
      items: [{ label: tx('Weitere Zutat Gärung','Other addition (fermentation)'), value: addLabel(z) }],
      checks: [addLabel(z) + tx(' zugegeben',' added')], info: noteInfo });
  });
  var re = (R.og !== null && R.attenuation !== null) ? R.og * (1 - R.attenuation / 100) : null;
  add({ phase: 'ferm', title: tx('Endvergärung prüfen','Check final attenuation'), temp: fT, stir: 'off', safety: true, calc: 'fg',
    do: tx('Miss den Restextrakt mit der Spindel an 2–3 aufeinanderfolgenden Tagen. Erst wenn sich der Wert nicht mehr ändert, ist das Bier endvergoren und darf abgefüllt werden.','Measure the final gravity with a hydrometer on 2–3 consecutive days. Only when the reading no longer changes is fermentation complete and the beer may be bottled.'),
    items: (re !== null ? [{ label: tx('Erwarteter Restextrakt (scheinbar)','Expected final gravity (apparent)'), value: tx('ca. ','approx. ') + fmtNum(re, 1) + '\u202F°P' }] : [])
      .concat(R.attenuation !== null ? [{ label: tx('Endvergärungsgrad laut Rezept','Attenuation (recipe)'), value: fmtNum(R.attenuation, 0) + ' %' }] : []),
    checks: [tx('Restextrakt an mindestens 2 Tagen hintereinander unverändert','Final gravity unchanged on at least 2 days in a row'), tx('Restextrakt liegt beim erwarteten Wert (deutlich darüber: NICHT abfüllen)','Final gravity is at the expected value (well above it: do NOT bottle)')],
    info: [tx('Liegt der Restextrakt deutlich über dem erwarteten Wert, kann die Gärung stecken geblieben sein. Abgefüllt gärt das Bier in der Flasche weiter: Flaschen können platzen.','If the final gravity is well above the expected value, fermentation may be stuck. Once bottled, the beer keeps fermenting in the bottle: bottles can burst.'),
      tx('Ein Refraktometer zeigt nach Gärbeginn wegen des Alkohols falsche Werte. Nimm die Spindel oder rechne den Wert um.','A refractometer shows wrong values after fermentation has started because of the alcohol. Use a hydrometer or convert the reading.')] });
  add({ phase: 'ferm', title: tx('Abfüllen mit Zucker (Flaschengärung)','Bottling with priming sugar (bottle conditioning)'), temp: T(null, tx('Abfüllen','Bottling'), 'off'), stir: 'off', calc: 'carb', safety: true,
    do: tx('Fülle das endvergorene Bier mit Zucker für die Nachgärung in Flaschen.','Bottle the fully fermented beer with priming sugar for bottle conditioning.') + (R.carbonation !== null ? tx(' Karbonisierung laut Rezept: ',' Carbonation according to the recipe: ') + fmtNum(R.carbonation, 1) + ' g/l CO₂.' : tx(' Das Rezept nennt keine Karbonisierung.',' The recipe does not state a carbonation level.')),
    items: R.carbonation !== null ? [{ label: tx('Karbonisierung laut Rezept','Carbonation (recipe)'), value: fmtNum(R.carbonation, 1) + ' g/l CO₂' }] : [],
    checks: [tx('Ich habe den Sicherheitshinweis gelesen und trage die volle Verantwortung für Zuckermenge und Abfüllung','I have read the safety notice and take full responsibility for the amount of sugar and for bottling'), tx('Nur unbeschädigte, für Kohlensäuredruck geeignete Flaschen verwendet','Only undamaged bottles rated for carbonation pressure used'), tx('Flaschen und Verschlüsse gereinigt und desinfiziert','Bottles and closures cleaned and sanitised')],
    info: [tx('Zucker in wenig Wasser aufkochen, abkühlen lassen und vorsichtig unter das Bier im Abfülleimer rühren (nicht schäumen lassen). Bodensatz im Gärbehälter lassen.','Boil the sugar in a little water, let it cool and stir it gently into the beer in the bottling bucket (avoid foaming). Leave the sediment behind in the fermenter.')] });
  add({ phase: 'ferm', title: tx('Nachgärung und Lagerung','Bottle conditioning and storage'), temp: T(20, tx('Nachgärung · Raumtemperatur','Bottle conditioning · room temperature'), 'hold'), stir: 'off', safety: true,
    do: tx('Lagere die Flaschen 1–2 Wochen bei etwa 18–22 °C in einer geschlossenen Kiste. Prüfe den Druck mit einer PET-Testflasche. Ist sie prall, stelle alle Flaschen kühl (unter 8 °C).','Store the bottles for 1–2 weeks at about 18–22 °C in a closed crate. Check the pressure with a PET test bottle. Once it is firm, move all bottles somewhere cool (below 8 °C).'),
    checks: [tx('Flaschen stehen in einer geschlossenen Kiste (Schutz bei Flaschenbruch)','Bottles are in a closed crate (protection if a bottle breaks)'), tx('Testflasche ist prall, Flaschen stehen kühl','Test bottle is firm, bottles are stored cool')],
    info: [tx('Wird die Testflasche hart wie Stein oder hörst du Flaschen platzen: Kiste nicht mit bloßen Händen öffnen, Schutzbrille und Handschuhe tragen, Flaschen kühlen und vorsichtig entlüften.','If the test bottle becomes rock hard or you hear bottles bursting: do not open the crate with bare hands, wear safety goggles and gloves, chill the bottles and vent them carefully.')] });
  return S;
}

/* ---------- Stammwürze: Umrechnung, Temperaturkorrektur, Mischkreuz ---------- */
function platoToSG(p) { return 1 + p / (258.6 - (p / 258.2) * 227.1); }
function sgToPlato(sg) { return -616.868 + 1111.14 * sg - 630.272 * sg * sg + 135.997 * sg * sg * sg; }
/* Spindel (Bezugstemperatur calC, meist 20 °C) auf Messtemperatur tC korrigieren */
function hydroCorrect(p, tC, calC) {
  calC = calC || 20;
  function f(c) { var t = c * 9 / 5 + 32; return 1.00130346 - 0.000134722124 * t + 0.00000204052596 * t * t - 0.00000000232820948 * t * t * t; }
  return sgToPlato(platoToSG(p) * f(tC) / f(calC));
}
function brixToPlato(b, wcf) { return b / (wcf || 1.03); }
/* Mischkreuz: pMeas und pTarget in °P, volL Liter Würze im Gärbehälter */
function ogAdvice(pMeas, pTarget, volL) {
  var o = { diff: pMeas - pTarget, status: 'ok' };
  if (Math.abs(o.diff) <= 0.3) return o;
  var mass = volL ? volL * platoToSG(pMeas) : null;           // kg Würze
  if (o.diff > 0) {
    o.status = 'high';
    o.waterPer10 = 10 * platoToSG(pMeas) * (pMeas - pTarget) / pTarget;   // L Wasser je 10 L Würze
    if (mass) { o.water = mass * (pMeas - pTarget) / pTarget; o.newVol = volL + o.water; }
  } else {
    o.status = 'low';
    if (mass) {
      o.sugar = mass * (pTarget - pMeas) / (100 - pTarget);   // kg Haushaltszucker (100 % Extrakt)
      o.dme = mass * (pTarget - pMeas) / (95 - pTarget);      // kg Trockenmalzextrakt (≈ 95 % Extrakt)
    }
    o.volAtTarget = volL ? volL * platoToSG(pMeas) * pMeas / (platoToSG(pTarget) * pTarget) : null; // Volumen, bei dem Ziel-SW erreicht wäre
  }
  return o;
}

/* ---------- Karbonisierung (Flaschengärung mit Haushaltszucker) ---------- */
/* gelöstes CO2 im Jungbier bei 1,013 bar (Formel laut MMuM-Spunddruckrechner, Quelle Braukaiser) */
function residualCO2(tC) { return 1.013 * Math.exp(-10.73797 + 2617.25 / (tC + 273.15)) * 10; }
/* Saccharose: 46,8 g CO2 je 100 g Würzezucker (realistisch laut MMuM), Saccharose ergibt 360/342 g Einfachzucker */
var CO2_PER_G_SUCROSE = 0.468 * 360 / 342;
function carbSugar(targetGL, tC, litres) {
  var res = residualCO2(tC), need = targetGL - res;
  var gPerL = need > 0 ? need / CO2_PER_G_SUCROSE : 0;
  return { residual: res, need: need, sugarPerL: gPerL, sugarTotal: litres ? gPerL * litres : null, dextroseTotal: litres ? gPerL * 1.09 * litres : null };
}

/* ---------- Alkohol ---------- */
/* nach Balling: Stammwürze og und scheinbarer Restextrakt ae in °P -> % vol */
function abvFromGravity(og, ae) {
  var er = 0.1808 * og + 0.8192 * ae;                 // wirklicher Restextrakt
  var abw = (og - er) / (2.0665 - 0.010665 * og);     // Alkohol in Gewichtsprozent
  return abw * platoToSG(ae) / 0.7907;                // in Volumenprozent
}
/* zusätzlicher Alkohol aus Haushaltszucker der Flaschengärung (g/l):
   46,8 g CO2 je 100 g vergorenem Zucker -> 48,9 g Ethanol, Saccharose x 360/342; 7,893 g/l Ethanol je % vol */
function primingAbv(sugarGL) { return sugarGL * 0.468 * (46.07 / 44.01) * (360 / 342) / 7.893; }
function apparentAttenuation(og, ae) { return (og - ae) / og * 100; }

/* Temperaturprofil für das Diagramm (Maischplan), Aufheizrate nur zur Darstellung */
function mashProfile(R, rate) {
  rate = rate || 1;
  var pts = [], segs = [];
  var t = 0, T0 = R.rests.length ? R.rests[0].temp : R.mashInTemp;
  if (T0 === null) return { pts: pts, segs: segs, total: 0 };
  pts.push([0, T0]);
  function goTo(temp) { if (Math.abs(temp - T0) < 0.1) return; var dt = Math.abs(temp - T0) / rate; t += dt; T0 = temp; pts.push([t, T0]); }
  function hold(min, label) { if (min <= 0) return; segs.push({ t0: t, t1: t + min, temp: T0, label: label }); t += min; pts.push([t, T0]); }
  var evs = [];
  if (R.decoctions.length) {
    var fr = R.decoctions[0].tempResult !== null ? R.decoctions[0].tempResult : Infinity;
    R.rests.filter(function (r) { return r.temp < fr; }).forEach(function (r) { evs.push({ k: 'r', r: r }); });
    R.decoctions.forEach(function (d) { evs.push({ k: 'd', d: d }); });
    R.rests.filter(function (r) { return r.temp >= fr; }).forEach(function (r) { evs.push({ k: 'r', r: r }); });
  } else R.rests.forEach(function (r) { evs.push({ k: 'r', r: r }); });
  var rn = 0;
  evs = evs.filter(function (e) { return !(e.k === 'r' && e.r.time <= 0 && e.r.temp >= R.mashOutTemp - 0.4); });
  evs.forEach(function (e) {
    if (e.k === 'r') { rn++; goTo(e.r.temp); hold(e.r.time, tx('Rast ','Rest ') + rn + ' · ' + restName(e.r.temp)); }
    else {
      var d = e.d; var dur = (d.partRestTime || 0) + (d.partBoilTime || 0) + 15;
      segs.push({ t0: t, t1: t + dur, temp: T0, label: tx('Dekoktion (Teilmaische)','Decoction'), dec: true }); t += dur; pts.push([t, T0]);
      if (d.tempResult !== null) { T0 = d.tempResult; pts.push([t, T0]); }
      hold(d.restTime, tx('Rast nach Dekoktion','Rest after decoction'));
    }
  });
  goTo(R.mashOutTemp);
  pts.push([t + 5, T0]); segs.push({ t0: t, t1: t + 5, temp: T0, label: tx('Abmaischen','Mash out'), mashout: true }); t += 5;
  return { pts: pts, segs: segs, total: t };
}

/* ---------- Rezept bearbeiten: Export und abhängige Werte ---------- */
function r4(v) { return v === null || v === undefined ? v : Math.round(v * 10000) / 10000; }
/* Geparstes (ggf. skaliertes) Rezept zurück in das MMuM-Format Version 2. Wieder importierbar. */
function toV2(R, edited) {
  var o = {
    Rezeptquelle: R.source || '', ExportVersion: '2.0', Name: R.name, Datum: R.date || '', Sorte: R.style || '', Autor: R.author || '',
    Ausschlagwuerze: r4(R.batchL) || 0, Sudhausausbeute: r4(R.sha) || 0, Stammwuerze: r4(R.og) || 0, Bittere: r4(R.ibu) || 0, Farbe: r4(R.ebc) || 0, Alkohol: r4(R.abv) || 0,
    Kurzbeschreibung: R.desc || '',
    Malze: R.malts.map(function (m) { var x = { Name: m.name, Menge: r4(m.amount), Einheit: m.unit || 'kg' }; if (m.ebc) x.Farbe_EBC = r4(m.ebc); return x; }),
    Maischform: R.mashForm || 'infusion', Hauptguss: r4(R.mainWater) || 0, Einmaischtemperatur: R.mashInTemp || 0,
    Rasten: R.rests.map(function (r) { return { Temperatur: r.temp, Zeit: r.time }; }),
    Dekoktionen: R.decoctions.map(function (d) { return { Volumen: r4(d.volume), Rastzeit: d.restTime, Temperatur_ist: d.tempIs, Temperatur_resultierend: d.tempResult, Form: d.form, Teilmaische_Rastzeit: d.partRestTime, Teilmaische_Kochzeit: d.partBoilTime, Teilmaische_Temperatur: d.partTemp }; }),
    Abmaischtemperatur: R.mashOutTemp || 0, Nachguss: r4(R.spargeWater) || 0, Kochzeit_Wuerze: R.boilTime,
    Hopfenkochen: R.hops.map(function (h) { return { Sorte: h.name, Menge: r4(h.amount), Alpha: h.alpha, Zeit: h.time === null ? 0 : h.time, Typ: h.type === 'fwh' ? 'Vorderwuerze' : h.type === 'whirlpool' ? 'Whirlpool' : 'Standard' }; }),
    Gewuerze_etc: R.boilAdds.map(function (z) { return { Name: z.name, Menge: r4(z.amount), Einheit: z.unit || '', Kochzeit: z.time }; }),
    Stopfhopfen: R.dryHops.map(function (h) { return { Sorte: h.name, Menge: r4(h.amount) }; }),
    Hefe: R.yeast || '', Gaertemperatur: R.fermTemp || '', Endvergaerungsgrad: r4(R.attenuation) || 0, Karbonisierung: r4(R.carbonation) || 0,
    WeitereZutatGaerung: R.fermAdds.map(function (z) { return { Name: z.name, Menge: r4(z.amount), Einheit: z.unit || '' }; }),
    Anmerkung_Autor: R.note || ''
  };
  if (!o.Dekoktionen.length) delete o.Dekoktionen;
  if (R.format && R.format !== 'maischemalzundmehr.de') o.Sudhelfer_Format = R.format;
  if (edited || R.edited) o.Sudhelfer_Bearbeitet = true;
  return o;
}
/* Typische Malzfarben in EBC (Mittelwerte aus Datenblättern, nur Schätzung für Malze ohne Farbangabe). Reihenfolge: speziell vor allgemein. */
var MALT_EBC = [
  [/r(ö|oe|o)stgerste|roasted barley/i, 1150], [/r(ö|oe|o)stmalz|carafa|farbmalz|black|patent|chocolate|schoko/i, 900],
  [/special ?b|cara ?aroma|caraaroma/i, 350], [/cara ?bohemian/i, 190], [/cara ?munich|caram(ü|ue|u)nch|crystal|karamellmalz dunkel|caramel.*dark|cara dunkel/i, 120],
  [/cara ?red|carared/i, 50], [/cara ?amber|caraamber/i, 70], [/cara ?hell|carahell|caramel.*(hell|light|pale)|karamellmalz hell/i, 25], [/cara ?pils|carapils|dextrin/i, 5],
  [/cara|karamell|caramel/i, 60], [/melanoidin/i, 70], [/biscuit|amber|abbey/i, 50], [/rauch|smoked/i, 6], [/sauer|acid/i, 4],
  [/roggen|rye/i, 7], [/hafer|oat/i, 5], [/dinkel|spelt/i, 5],
  [/weizen.*dunkel|dark wheat/i, 17], [/weizen|wheat/i, 4.5],
  [/m(ü|ue|u)nch.*(dunkel|dark|ii|2)/i, 25], [/m(ü|ue|u)nch|munich/i, 15], [/wiener|vienna/i, 8],
  [/pale ale|maris|golden promise/i, 6.5], [/pils|pilsner|lager|extra pale/i, 3.5]
];
function guessMaltEBC(name) {
  for (var i = 0; i < MALT_EBC.length; i++) if (MALT_EBC[i][0].test(name || '')) return MALT_EBC[i][1];
  return 8;
}
var SUGAR_RE = /zucker|sugar|honig|honey|sirup|syrup|dextrose|glucose|glukose|kandis|candi|malzextrakt|malt extract|melasse|molasses/i;
function sugarKg(R) {
  return R.boilAdds.reduce(function (s, z) {
    if (!SUGAR_RE.test(z.name) || z.amount === null) return s;
    var u = (z.unit || '').toLowerCase();
    return s + (u === 'g' ? z.amount / 1000 : u === 'kg' ? z.amount : 0);
  }, 0);
}
/* Extraktmasse in kg, die V Liter heiße Ausschlagwürze (0,96 = Schwand beim Abkühlen) mit P °Plato enthalten */
function extractKg(P, V) { return V * 0.96 * platoToSG(P) * P / 100; }
function ogFromExtract(kg, V) {
  if (!(V > 0) || !(kg > 0)) return null;
  var P = 12;
  for (var i = 0; i < 40; i++) P = kg * 100 / (V * 0.96 * platoToSG(P));
  return P;
}
function tinsethIBU(R, og) {
  if (!(R.batchL > 0)) return null;
  var big = 1.65 * Math.pow(0.000125, platoToSG(og || 12) - 1), bt = R.boilTime || 60, sum = 0;
  R.hops.forEach(function (h) {
    if (!(h.amount > 0) || !(h.alpha > 0)) return;
    var t = h.type === 'fwh' ? bt : h.type === 'whirlpool' ? 10 : Math.max(0, Math.min(bt, h.time || 0));
    sum += big * (1 - Math.exp(-0.04 * t)) / 4.15 * h.amount * h.alpha / 100 * 1000 / R.batchL;
  });
  return sum;
}
function moreyEBC(R) {
  if (!(R.batchL > 0)) return null;
  var mcu = 0;
  R.malts.forEach(function (m) {
    var u = (m.unit || '').toLowerCase(), kg = u === 'g' ? m.amount / 1000 : u === 'kg' ? m.amount : 0;
    var ebc = m.ebc || guessMaltEBC(m.name), lov = (ebc / 1.97 + 0.76) / 1.3546;
    mcu += kg * 2.20462 * lov / (R.batchL * 0.264172);
  });
  return mcu > 0 ? 1.4922 * Math.pow(mcu, 0.6859) * 1.97 : 0;
}
/* Rechenwerte ohne Abgleich */
function rawStats(R, k) {
  var grist = maltTotalKg(R), og = ogFromExtract(k * grist + sugarKg(R), R.batchL);
  var abv = (og !== null && R.attenuation) ? abvFromGravity(og, og * (1 - R.attenuation / 100)) : null;
  return { grist: grist, og: og, abv: abv, ibu: tinsethIBU(R, og), ebc: moreyEBC(R), thick: grist > 0 && R.mainWater ? R.mainWater / grist : null };
}
/* Abgleich am Ausgangsrezept: Ausbeute und Korrekturfaktoren so, dass das unveränderte Rezept seine eigenen Werte ergibt. */
function calibrate(R0) {
  var grist = maltTotalKg(R0), k = null;
  if (R0.og && R0.batchL && grist > 0) k = (extractKg(R0.og, R0.batchL) - sugarKg(R0)) / grist;
  if (!(k > 0.2 && k < 1)) k = R0.sha ? R0.sha / 100 : 0.65;
  var raw = rawStats(R0, k);
  /* Korrekturfaktor nur in plausiblen Grenzen, sonst ohne Abgleich rechnen (z. B. bei fehlerhaften Rezeptwerten) */
  function f(given, calc, lo, hi) { var q = given && calc > 0 ? given / calc : 1; return q >= (lo || 0.5) && q <= (hi || 2) ? q : 1; }
  return { k: k, sha0: R0.sha || null, fAbv: f(R0.abv, raw.abv, 0.8, 1.25), fIbu: f(R0.ibu, raw.ibu, 0.02, 50), fEbc: f(R0.ebc, raw.ebc, 0.02, 50), hadIbu: !!R0.ibu, hadEbc: !!R0.ebc, hadAbv: !!R0.abv, hadOg: !!R0.og };
}
/* Werte des (bearbeiteten) Rezepts R, abgeglichen mit cal = calibrate(Ausgangsrezept) */
function recipeStats(R, cal) {
  var k = cal.k * (cal.sha0 && R.sha ? R.sha / cal.sha0 : 1), s = rawStats(R, k);
  if (s.abv !== null) s.abv *= cal.fAbv;
  if (s.ibu !== null) s.ibu *= cal.fIbu;
  if (s.ebc !== null) s.ebc *= cal.fEbc;
  return s;
}
/* ---------- Wasserbilanz ----------
   Ausschlagwürze = Hauptguss + Nachguss − Treberverlust − Verdampfung und übrige Verluste.
   Treberverlust: rund 0,9 L Wasser je kg Malz bleiben im Treber. Der Rest (Verdampfung beim Kochen u. a.) wird am
   Rezept abgeglichen und wächst mit der Kochzeit. So ergibt das unveränderte Rezept genau seine eigene Ausschlagwürze. */
function waterBalance(R0) {
  var g = maltTotalKg(R0);
  if (!(R0.mainWater > 0) || !(R0.spargeWater >= 0) || R0.spargeWater === null || !(R0.batchL > 0)) return null;
  var loss = R0.mainWater + R0.spargeWater - R0.batchL, a = 0.9;
  if (loss < a * g) a = g > 0 ? Math.max(0, loss / g) : 0;
  return { a: a, evap: loss - a * g, boil0: R0.boilTime || 60, loss: loss };
}
function wbLoss(R, wb) { return wb.a * maltTotalKg(R) + wb.evap * ((R.boilTime || wb.boil0) / wb.boil0); }
function batchFromWater(R, wb) { return (R.mainWater || 0) + (R.spargeWater || 0) - wbLoss(R, wb); }
function spargeForBatch(R, wb, batchL) { return Math.max(0, batchL + wbLoss(R, wb) - (R.mainWater || 0)); }

/* Neue Hopfenmenge bei anderem Alphasäuregehalt, gleiche Bittere: Menge × Alpha alt / Alpha neu */
function hopForAlpha(amount, alphaOld, alphaNew) {
  if (!(amount > 0) || !(alphaOld > 0) || !(alphaNew > 0)) return amount;
  var g = amount * alphaOld / alphaNew;
  return g < 20 ? Math.round(g * 10) / 10 : Math.round(g);
}

if (typeof module !== 'undefined') module.exports = { waterBalance: waterBalance, batchFromWater: batchFromWater, spargeForBatch: spargeForBatch, toV2: toV2, guessMaltEBC: guessMaltEBC, calibrate: calibrate, recipeStats: recipeStats, rawStats: rawStats, hopForAlpha: hopForAlpha, extractKg: extractKg, ogFromExtract: ogFromExtract, xmlParse: xmlParse, beerxmlToMmum: beerxmlToMmum, beerjsonToMmum: beerjsonToMmum, abvFromGravity: abvFromGravity, primingAbv: primingAbv, apparentAttenuation: apparentAttenuation, residualCO2: residualCO2, carbSugar: carbSugar, maxFermTemp: maxFermTemp, platoToSG: platoToSG, sgToPlato: sgToPlato, hydroCorrect: hydroCorrect, brixToPlato: brixToPlato, ogAdvice: ogAdvice, parseRecipe: parseRecipe, buildSteps: buildSteps, scaleRecipe: scaleRecipe, mashProfile: mashProfile, fmtNum: fmtNum, setLang: setLang, tx: tx, phaseName: phaseName, pitchTemp: pitchTemp, maltTotalKg: maltTotalKg };
