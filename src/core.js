/* ===== Sudhelfer core: MMuM-Parser + Schrittgenerator (ohne DOM) ===== */

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
  return s.replace('.', ',');
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
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Die Datei enthält kein Rezept-Objekt.');
  var R = {
    source: str(j.Rezeptquelle), version: str(j.ExportVersion) || (j.Malze ? '2.0' : '1.x'),
    name: str(j.Name) || 'Unbenanntes Rezept', date: str(j.Datum), style: str(j.Sorte), author: str(j.Autor),
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
    j.Malze.forEach(function (m) { if (str(m.Name) && num(m.Menge) !== null) R.malts.push({ name: str(m.Name), amount: num(m.Menge), unit: str(m.Einheit) || 'kg' }); });
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
      R.hops.push({ name: str(h.Sorte) || 'Hopfen', amount: num(h.Menge), alpha: num(h.Alpha), time: num(h.Zeit), type: hopType(h.Typ), rawType: str(h.Typ) });
    });
  } else {
    for (i = 1; i <= 20; i++) {
      if (str(j['Hopfen_VWH_' + i + '_Sorte']) || num(j['Hopfen_VWH_' + i + '_Menge']) !== null) {
        if (num(j['Hopfen_VWH_' + i + '_Menge']) === null) continue;
        R.hops.push({ name: str(j['Hopfen_VWH_' + i + '_Sorte']) || 'Hopfen', amount: num(j['Hopfen_VWH_' + i + '_Menge']), alpha: num(j['Hopfen_VWH_' + i + '_alpha']), time: null, type: 'fwh', rawType: 'Vorderwuerze' });
      }
    }
    for (i = 1; i <= 20; i++) {
      var hm = num(j['Hopfen_' + i + '_Menge']);
      if (hm === null) continue;
      var kz = j['Hopfen_' + i + '_Kochzeit'];
      var isWp = /whirl/i.test(str(kz));
      R.hops.push({ name: str(j['Hopfen_' + i + '_Sorte']) || 'Hopfen', amount: hm, alpha: num(j['Hopfen_' + i + '_alpha']), time: isWp ? 0 : num(kz), type: isWp ? 'whirlpool' : 'boil', rawType: isWp ? 'Whirlpool' : 'Standard' });
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
    j.Stopfhopfen.forEach(function (h) { if (str(h.Sorte) || num(h.Menge) !== null) R.dryHops.push({ name: str(h.Sorte) || 'Hopfen', amount: num(h.Menge) }); });
  } else {
    for (i = 1; i <= 20; i++) if (str(j['Stopfhopfen_' + i + '_Sorte']) || num(j['Stopfhopfen_' + i + '_Menge']) !== null) {
      if (num(j['Stopfhopfen_' + i + '_Menge']) === null && !str(j['Stopfhopfen_' + i + '_Sorte'])) continue;
      R.dryHops.push({ name: str(j['Stopfhopfen_' + i + '_Sorte']) || 'Hopfen', amount: num(j['Stopfhopfen_' + i + '_Menge']) });
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
    throw new Error('Die Datei enthält kein vollständiges Rezept: Es fehlen Malze, Rasten, Kochzeit und Hopfen. Erwartet wird ein Export von maischemalzundmehr.de (JSON), BeerXML oder BeerJSON.');
  if (R.batchL === null) R.warnings.push('Das Rezept nennt keine Ausschlagwürze (im Export steht 0). Alle Mengen gelten wie im Rezept, Umrechnen ist nicht möglich.');
  if (R.mainWater === null) R.warnings.push('Hauptguss fehlt im Rezept.');
  if (R.spargeWater === null) R.warnings.push('Nachguss fehlt im Rezept.');
  if (R.mashInTemp === null) {
    if (R.rests.length) { R.mashInTemp = R.rests[0].temp; R.warnings.push('Einmaischtemperatur fehlt – es wird die Temperatur der 1. Rast (' + fmtT(R.mashInTemp) + ') verwendet.'); }
    else R.warnings.push('Einmaischtemperatur fehlt im Rezept.');
  }
  if (R.mashOutTemp === null) { R.mashOutTemp = 78; R.warnings.push('Abmaischtemperatur fehlt – es werden 78 °C verwendet.'); }
  if (R.boilTime === null || R.boilTime <= 0) { R.boilTime = 60; R.warnings.push('Kochzeit fehlt – es werden 60 min verwendet.'); }
  if (!R.rests.length && !R.decoctions.length) R.warnings.push('Das Rezept enthält keine Rasten.');
  R.hops.forEach(function (h) {
    if (h.type === 'boil' && h.time === null) { h.time = R.boilTime; R.warnings.push('Hopfengabe ' + h.name + ' ohne Kochzeit – wird zu Kochbeginn eingeplant.'); }
    if (h.type === 'boil' && h.time > R.boilTime) R.warnings.push('Hopfengabe ' + h.name + ': ' + h.time + ' min ist länger als die Kochzeit (' + R.boilTime + ' min) – wird zu Kochbeginn gegeben.');
    if (['fwh', 'whirlpool', 'boil'].indexOf(h.type) >= 0 && h.rawType && !/^(standard|vorderwuerze|vorderwürze|whirlpool)$/i.test(h.rawType))
      R.warnings.push('Unbekannter Hopfen-Typ „' + h.rawType + '“ bei ' + h.name + ' – als Kochhopfen behandelt.');
  });
  R.boilAdds.forEach(function (z) { if (z.time === null) { z.time = 0; R.warnings.push('Zutat ' + z.name + ' ohne Kochzeit – wird bei Kochende eingeplant.'); } });
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
  R.format = conv ? conv.format : 'maischemalzundmehr.de';
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
    var gt = src.indexOf('>', lt); if (gt < 0) throw new Error('Die XML-Datei ist unvollständig.');
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
  if (!recs.length) throw new Error('In der XML-Datei wurde kein BeerXML-Rezept (<RECIPE>) gefunden.');
  if (recs.length > 1) W.push('Die Datei enthält ' + recs.length + ' Rezepte. Übernommen wurde das erste: „' + xTxt(recs[0], 'NAME') + '“.');
  var r = recs[0];
  var o = { Rezeptquelle: 'BeerXML-Datei', ExportVersion: 'BeerXML 1.0', Name: xTxt(r, 'NAME'), Datum: xTxt(r, 'DATE'), Sorte: xTxt(xKid(r, 'STYLE'), 'NAME'), Autor: xTxt(r, 'BREWER'),
    Malze: [], Rasten: [], Hopfenkochen: [], Gewuerze_etc: [], Stopfhopfen: [], WeitereZutatGaerung: [] };
  var type = xTxt(r, 'TYPE').toLowerCase();
  if (type && type.indexOf('all grain') < 0) W.push('Rezepttyp „' + xTxt(r, 'TYPE') + '“: Die App ist für Rezepte mit Maischen ausgelegt. Extrakt-Anteile prüfen.');
  var batch = xNum(r, 'BATCH_SIZE'), boilSize = xNum(r, 'BOIL_SIZE');
  o.Ausschlagwuerze = batch; if (batch) W.push('BeerXML nennt die Chargengröße (meist Menge im Gärbehälter). Sie wird als Ausschlagwürze verwendet.');
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
    else { o.Gewuerze_etc.push({ Name: name, Menge: mm.Menge, Einheit: mm.Einheit, Kochzeit: 0 }); W.push('„' + name + '“: BeerXML nennt keinen Zeitpunkt. Eingeplant bei Kochende, bitte im Original prüfen.'); }
  });
  xKids(xKid(r, 'HOPS'), 'HOP').forEach(function (h) {
    var name = xTxt(h, 'NAME'), use = xTxt(h, 'USE').toLowerCase(), g = (xNum(h, 'AMOUNT') || 0) * 1000, a = xNum(h, 'ALPHA'), t = xNum(h, 'TIME');
    if (use.indexOf('dry') >= 0) { o.Stopfhopfen.push({ Sorte: name, Menge: r1(g, 1) }); if (t) W.push('Hopfenstopfen „' + name + '“: laut Datei ' + r1(t / 1440, 0) + ' Tage im Bier.'); }
    else if (use.indexOf('first') >= 0) o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: 0, Typ: 'Vorderwuerze' });
    else if (use.indexOf('aroma') >= 0 || use.indexOf('whirl') >= 0) o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: t || 0, Typ: 'Whirlpool' });
    else if (use.indexOf('mash') >= 0) { o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: 0, Typ: 'Vorderwuerze' }); W.push('Maischehopfen „' + name + '“ wird als Vorderwürzehopfen eingeplant. Willst du ihn wie im Original in die Maische geben, tu das beim Einmaischen.'); }
    else o.Hopfenkochen.push({ Sorte: name, Menge: r1(g, 1), Alpha: a, Zeit: t, Typ: 'Standard' });
  });
  xKids(xKid(r, 'MISCS'), 'MISC').forEach(function (m) {
    var name = xTxt(m, 'NAME'), use = xTxt(m, 'USE').toLowerCase(), amt = xNum(m, 'AMOUNT'), w = /true/i.test(xTxt(m, 'AMOUNT_IS_WEIGHT')), t = xNum(m, 'TIME');
    var q = amt === null ? { Menge: null, Einheit: '' } : w ? massOut(amt * 1000) : (amt < 1 ? { Menge: r1(amt * 1000, 0), Einheit: 'ml' } : { Menge: r1(amt, 2), Einheit: 'l' });
    if (use === 'boil') o.Gewuerze_etc.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit, Kochzeit: t || 0 });
    else if (use === 'primary' || use === 'secondary' || use === 'bottling') o.WeitereZutatGaerung.push({ Name: name + (use === 'bottling' ? ' (beim Abfüllen)' : ''), Menge: q.Menge, Einheit: q.Einheit });
    else W.push('„' + name + '“ (' + (use || 'ohne Angabe') + '): ' + (q.Menge !== null ? q.Menge + ' ' + q.Einheit : '') + '. Wird nicht als Schritt angezeigt, bitte selbst einplanen (z. B. Wasseraufbereitung).');
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
    else if (st === 'infusion' && inf) W.push('Rast „' + xTxt(s, 'NAME') + '“: Das Original gibt ' + r1(inf, 1) + ' L heißes Wasser zu. Die App heizt stattdessen auf ' + r1(temp, 0) + ' °C.');
    if (st === 'decoction') W.push('Rast „' + xTxt(s, 'NAME') + '“ ist im Original eine Dekoktion. BeerXML beschreibt die Teilmaische nicht, die App plant eine normale Rast.');
    if (temp !== null) o.Rasten.push({ Temperatur: r1(temp, 1), Zeit: time });
  });
  if (o.Rasten.length) { var last = o.Rasten[o.Rasten.length - 1]; if (last.Temperatur >= 75) o.Abmaischtemperatur = last.Temperatur; }
  if (o.Einmaischtemperatur === null && o.Rasten.length) W.push('Die Einmaischtemperatur fehlt in der Datei. Erhitze das Wasser etwa 3–5 °C über die erste Rast.');
  if (o.Hauptguss && boilSize) {
    var ng = boilSize - o.Hauptguss + maltKg * 1.0;
    o.Nachguss = ng > 0 ? r1(ng, 1) : null;
    W.push('Nachguss geschätzt aus Pfannevollwürze (' + r1(boilSize, 1) + ' L) − Hauptguss + 1 L je kg Malz Treberverlust. Mit deiner Anlage abgleichen.');
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
  if (!recs.length) throw new Error('In der BeerJSON-Datei wurde kein Rezept gefunden.');
  if (recs.length > 1) W.push('Die Datei enthält ' + recs.length + ' Rezepte. Übernommen wurde das erste: „' + recs[0].name + '“.');
  var r = recs[0], ing = r.ingredients || {};
  var o = { Rezeptquelle: 'BeerJSON-Datei', ExportVersion: 'BeerJSON ' + (j.beerjson.version || '1.0'), Name: r.name || '', Datum: r.created || '', Sorte: (r.style && r.style.name) || '', Autor: r.author || '',
    Malze: [], Rasten: [], Hopfenkochen: [], Gewuerze_etc: [], Stopfhopfen: [], WeitereZutatGaerung: [] };
  if (r.type && r.type !== 'all grain') W.push('Rezepttyp „' + r.type + '“: Die App ist für Rezepte mit Maischen ausgelegt. Extrakt-Anteile prüfen.');
  var batch = bjVolL(r.batch_size); o.Ausschlagwuerze = batch !== null ? r1(batch, 1) : null;
  if (batch !== null) W.push('BeerJSON nennt die Chargengröße (meist Menge im Gärbehälter). Sie wird als Ausschlagwürze verwendet.');
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
    else if (use === 'add_to_fermentation' || use === 'add_to_package') o.WeitereZutatGaerung.push({ Name: name + (use === 'add_to_package' ? ' (beim Abfüllen)' : ''), Menge: q.Menge, Einheit: q.Einheit });
    else if (use === 'add_to_mash') { o.Malze.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit }); W.push('„' + name + '“ kommt laut Rezept in die Maische.'); }
    else { var d = f.timing ? bjMin(f.timing.duration) : null; o.Gewuerze_etc.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit, Kochzeit: d !== null ? d : 0 }); if (d === null) W.push('„' + name + '“: kein Zeitpunkt in der Datei. Eingeplant bei Kochende, bitte im Original prüfen.'); }
  });
  (ing.hop_additions || []).forEach(function (h) {
    var tm = h.timing || {}, use = tm.use, g = bjMassG(h.amount), a = h.alpha_acid ? h.alpha_acid.value : null, name = h.name || 'Hopfen';
    var d = bjMin(tm.duration); if (d === null) d = bjMin(tm.time);
    if (use === 'add_to_fermentation' || use === 'add_to_package') { o.Stopfhopfen.push({ Sorte: name, Menge: g !== null ? r1(g, 1) : null }); var dd = bjDays(tm.time); if (dd !== null) W.push('Hopfenstopfen „' + name + '“: laut Datei an Tag ' + r1(dd, 0) + ' der Gärung' + (tm.duration ? ', ' + r1(bjDays(tm.duration), 0) + ' Tage' : '') + '.'); }
    else if (use === 'add_to_mash') { o.Hopfenkochen.push({ Sorte: name, Menge: g !== null ? r1(g, 1) : null, Alpha: a, Zeit: 0, Typ: 'Vorderwuerze' }); W.push('Hopfen „' + name + '“ (add_to_mash) wird als Vorderwürzehopfen eingeplant. Bitte im Original prüfen.'); }
    else o.Hopfenkochen.push({ Sorte: name, Menge: g !== null ? r1(g, 1) : null, Alpha: a, Zeit: d !== null ? d : 0, Typ: 'Standard' });
  });
  (ing.miscellaneous_additions || []).forEach(function (m) {
    var tm = m.timing || {}, use = tm.use, q = bjAmount(m.amount), name = m.name || 'Zutat', d = bjMin(tm.duration);
    if (use === 'add_to_boil') o.Gewuerze_etc.push({ Name: name, Menge: q.Menge, Einheit: q.Einheit, Kochzeit: d !== null ? d : 0 });
    else if (use === 'add_to_fermentation' || use === 'add_to_package') o.WeitereZutatGaerung.push({ Name: name + (use === 'add_to_package' ? ' (beim Abfüllen)' : ''), Menge: q.Menge, Einheit: q.Einheit });
    else W.push('„' + name + '“ (' + (use || 'ohne Angabe') + '): ' + (q.Menge !== null ? q.Menge + ' ' + q.Einheit : '') + '. Wird nicht als Schritt angezeigt, bitte selbst einplanen (z. B. Wasseraufbereitung).');
  });
  var c = (ing.culture_additions || [])[0];
  if (c) {
    var extra = [c.producer, c.product_id].filter(function (x) { return x && (c.name || '').toLowerCase().indexOf(String(x).toLowerCase()) < 0; });
    o.Hefe = (c.name || 'Hefe') + (extra.length ? ' (' + extra.join(' ') + ')' : '');
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
    else if (ty === 'infusion' && amt) W.push('Rast „' + (s.name || '') + '“: Das Original gibt ' + r1(amt, 1) + ' L heißes Wasser zu. Die App heizt stattdessen auf ' + r1(temp, 0) + ' °C.');
    if (ty === 'decoction') W.push('Rast „' + (s.name || '') + '“ ist im Original eine Dekoktion. Die Teilmaische wird nicht beschrieben, die App plant eine normale Rast.');
    if (temp !== null) o.Rasten.push({ Temperatur: r1(temp, 1), Zeit: time });
  });
  if (o.Rasten.length) { var last = o.Rasten[o.Rasten.length - 1]; if (last.Temperatur >= 75) o.Abmaischtemperatur = last.Temperatur; }
  if (o.Einmaischtemperatur === null && o.Rasten.length) W.push('Die Einmaischtemperatur fehlt in der Datei. Erhitze das Wasser etwa 3–5 °C über die erste Rast.');
  if (sparge > 0) o.Nachguss = r1(sparge, 1);
  else if (o.Hauptguss && r.boil && r.boil.pre_boil_size) {
    var pb = bjVolL(r.boil.pre_boil_size), ng = pb - o.Hauptguss + maltKg;
    o.Nachguss = ng > 0 ? r1(ng, 1) : null;
    W.push('Nachguss geschätzt aus Pfannevollwürze (' + r1(pb, 1) + ' L) − Hauptguss + 1 L je kg Malz Treberverlust. Mit deiner Anlage abgleichen.');
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
  if (t <= 44) return 'Glucanaserast';
  if (t <= 55) return 'Eiweißrast';
  if (t <= 65) return 'Maltoserast';
  if (t <= 69) return 'Kombirast';
  if (t <= 75) return 'Verzuckerungsrast';
  return 'Abmaischrast';
}
function hopLabel(h) { return fmtAmount(h.amount, 'g') + ' ' + h.name + (h.alpha !== null ? ' (' + fmtNum(h.alpha, 1) + ' % α)' : ''); }
function addLabel(z) { return (z.amount !== null ? fmtAmount(z.amount, z.unit) + ' ' : '') + z.name; }

var PHASES = [
  { key: 'prep', name: 'Vorbereitung' },
  { key: 'mash', name: 'Maischen' },
  { key: 'lauter', name: 'Läutern' },
  { key: 'boil', name: 'Kochen' },
  { key: 'whirl', name: 'Whirlpool & Kühlen' },
  { key: 'pitch', name: 'Anstellen' },
  { key: 'ferm', name: 'Gärung & Abfüllen' }
];

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
  fwh.forEach(function (h) { hopItems.push({ label: 'Vorderwürze', value: hopLabel(h) }); });
  R.hops.filter(function (h) { return h.type === 'boil'; }).sort(function (a, b) { return b.time - a.time; })
    .forEach(function (h) { hopItems.push({ label: Math.min(h.time, R.boilTime) + ' min', value: hopLabel(h) }); });
  wph.forEach(function (h) { hopItems.push({ label: 'Whirlpool', value: hopLabel(h) }); });
  var prepItems = R.malts.map(function (m) { return { label: 'Malz', value: fmtAmount(m.amount, m.unit) + ' ' + m.name }; })
    .concat(hopItems.map(function (h) { return { label: 'Hopfen ' + h.label, value: h.value }; }))
    .concat(R.boilAdds.map(function (z) { return { label: 'Zutat ' + Math.min(z.time, R.boilTime) + ' min', value: addLabel(z) }; }))
    .concat(R.yeast ? [{ label: 'Hefe', value: R.yeast }] : []);
  add({ phase: 'prep', title: 'Zutaten abwiegen', temp: T(null, 'Noch nicht heizen', 'off'), stir: 'off',
    do: 'Wiege alle Zutaten ab und stelle sie in der Reihenfolge der Zugabe bereit. Jede Hopfengabe einzeln abwiegen und beschriften.',
    items: prepItems,
    checks: ['Malz ist geschrotet', 'Alle Hopfengaben einzeln abgewogen und beschriftet'] });
  add({ phase: 'prep', title: 'Geräte bereitstellen', temp: T(null, 'Noch nicht heizen', 'off'), stir: 'off',
    do: 'Stelle die Geräte bereit, die du für den Brautag brauchst.',
    checks: ['Einkochtopf sauber, Rührwerk montiert (falls vorhanden)', 'Thermometer, Jodlösung und weißer Teller bereit',
      'Läuterbottich mit Läuterhexe/Läuterblech bereit, Hahn geschlossen', 'Zweiter Topf oder Wasserkocher für ' + fmtL(R.spargeWater) + ' Nachguss bereit',
      'Gärbehälter gereinigt, Desinfektionsmittel bereit'] });
  add({ phase: 'prep', title: 'Hauptguss einfüllen', temp: T(null, 'Noch nicht heizen', 'off'), stir: 'off',
    do: 'Fülle ' + fmtL(R.mainWater) + ' Wasser (Hauptguss) in den Einkochtopf.',
    items: [{ label: 'Hauptguss', value: fmtL(R.mainWater) }] });
  add({ phase: 'prep', title: 'Hauptguss auf ' + fmtT(R.mashInTemp) + ' erhitzen', temp: T(R.mashInTemp, 'Wasser · Einmaischtemperatur', 'heat'), stir: 'off',
    do: 'Stelle den Einkochtopf auf ' + fmtT(R.mashInTemp) + ' und heize den Hauptguss auf. Bestätige, wenn das Wasser ' + fmtT(R.mashInTemp) + ' hat.',
    info: ['Die Einmaischtemperatur bei maischemalzundmehr.de ist die Wassertemperatur. Nach der Malzzugabe fällt die Temperatur um etwa 3–5 °C.'] });

  /* --- Maischen --- */
  add({ phase: 'mash', title: 'Einmaischen', temp: T(R.mashInTemp, 'Maische', 'hold'), stir: 'on',
    do: 'Rührwerk einschalten. Schütte das Malz (' + fmtNum(kg, 2) + ' kg) langsam ein und rühre, bis keine Klumpen mehr da sind. Einkochtopf bleibt auf ' + fmtT(R.mashInTemp) + '.',
    items: R.malts.map(function (m) { return { label: 'Malz', value: fmtAmount(m.amount, m.unit) + ' ' + m.name }; }) });

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
  var spargeCheck = 'Parallel: ' + fmtL(R.spargeWater) + ' Nachguss im zweiten Topf/Wasserkocher auf ' + fmtT(spargeT) + ' erhitzen und warm halten';
  var curT = R.mashInTemp;
  var restNo = 0, decNo = 0, lastRestStep = null, jodRestStep = null;

  events.forEach(function (e, i) {
    var lastStepOfEvent = null;
    if (e.kind === 'rest') {
      var r = e.r; restNo++;
      var label = 'Rast ' + restNo + ' · ' + restName(r.temp);
      if (restNo === 1 && i === 0) {
        lastStepOfEvent = add({ phase: 'mash', title: 'Maische auf ' + fmtT(r.temp) + ' einstellen', temp: T(r.temp, 'Maische · ' + label, 'heat'), stir: 'on',
          do: 'Stelle den Einkochtopf auf ' + fmtT(r.temp) + '. Miss die Maischetemperatur. Ist sie niedriger: heizen und rühren. Ist sie höher: ohne Deckel rühren, bis ' + fmtT(r.temp) + ' erreicht sind. Bestätige bei ' + fmtT(r.temp) + '.' });
      } else if (Math.abs(r.temp - curT) >= 0.5) {
        lastStepOfEvent = add({ phase: 'mash', title: 'Aufheizen auf ' + fmtT(r.temp), temp: T(r.temp, 'Maische · ' + label, r.temp > curT ? 'heat' : 'hold'), stir: 'on',
          do: 'Stelle den Einkochtopf auf ' + fmtT(r.temp) + ' und heize unter ständigem Rühren auf. Bestätige, wenn die Maische ' + fmtT(r.temp) + ' hat.' });
      }
      if (r.time > 0) {
        lastStepOfEvent = add({ phase: 'mash', title: 'Rast ' + restNo + ': ' + fmtT(r.temp) + ' · ' + fmtNum(r.time, 1) + ' min', sub: restName(r.temp),
          temp: T(r.temp, 'Maische halten · ' + label, 'hold'), stir: 'on',
          do: 'Halte die Maische ' + fmtNum(r.time, 1) + ' Minuten auf ' + fmtT(r.temp) + '. Rührwerk laufen lassen (von Hand: alle 5 Minuten umrühren).',
          timer: { kind: 'rest', minutes: r.time, label: 'Rast ' + restNo } });
        lastRestStep = lastStepOfEvent;
      }
      curT = r.temp;
    } else {
      var d = e.d; decNo++;
      var dn = 'Dekoktion ' + decNo;
      var hold = d.tempIs !== null ? d.tempIs : curT;
      lastStepOfEvent = add({ phase: 'mash', title: dn + ': Teilmaische ziehen', temp: T(hold, 'Hauptmaische halten (Einkochtopf)', 'hold'), stir: 'on',
        do: 'Entnimm ' + fmtL(d.volume) + (d.form ? ' ' + d.form : ' Teilmaische') + ' aus dem Einkochtopf in den zweiten Topf. Die Hauptmaische bleibt bei ' + fmtT(hold) + ', Rührwerk an.',
        items: [{ label: 'Teilmaische', value: fmtL(d.volume) + (d.form ? ' (' + d.form + ')' : '') }],
        info: ['Dickmaische: vor allem Malz mit wenig Flüssigkeit schöpfen. Dünnmaische: vor allem Flüssigkeit.'] });
      if (d.partTemp !== null && d.partRestTime > 0) {
        add({ phase: 'mash', title: dn + ': Teilmaische auf ' + fmtT(d.partTemp), temp: T(d.partTemp, 'Teilmaische (zweiter Topf)', 'heat'), stir: 'on',
          do: 'Heize die Teilmaische im zweiten Topf unter ständigem Rühren auf ' + fmtT(d.partTemp) + '. Hauptmaische weiter auf ' + fmtT(hold) + ' halten.' });
        add({ phase: 'mash', title: dn + ': Teilmaische ' + fmtNum(d.partRestTime, 1) + ' min bei ' + fmtT(d.partTemp), temp: T(d.partTemp, 'Teilmaische halten (zweiter Topf)', 'hold'), stir: 'on',
          do: 'Halte die Teilmaische ' + fmtNum(d.partRestTime, 1) + ' Minuten auf ' + fmtT(d.partTemp) + ' und rühre regelmäßig.',
          timer: { kind: 'rest', minutes: d.partRestTime, label: 'Teilmaische-Rast' } });
      }
      if (d.partBoilTime > 0) {
        add({ phase: 'mash', title: dn + ': Teilmaische zum Kochen bringen', temp: T(100, 'Teilmaische (zweiter Topf)', 'boil'), stir: 'on',
          do: 'Bringe die Teilmaische unter ständigem Rühren zum Kochen. Sie brennt leicht an: nicht aufhören zu rühren.' });
        add({ phase: 'mash', title: dn + ': Teilmaische ' + fmtNum(d.partBoilTime, 1) + ' min kochen', temp: T(100, 'Teilmaische kochen (zweiter Topf)', 'boil'), stir: 'on',
          do: 'Koche die Teilmaische ' + fmtNum(d.partBoilTime, 1) + ' Minuten unter ständigem Rühren.',
          timer: { kind: 'rest', minutes: d.partBoilTime, label: 'Teilmaische kochen' } });
      }
      lastStepOfEvent = add({ phase: 'mash', title: dn + ': zurück zur Hauptmaische', temp: T(d.tempResult, 'Gesamtmaische · Ziel', 'hold'), stir: 'on',
        do: 'Gib die Teilmaische langsam unter Rühren zurück in den Einkochtopf. Ziel: ' + fmtT(d.tempResult) + '. Stelle den Einkochtopf auf ' + fmtT(d.tempResult) + ' und korrigiere, bis die Maische ' + fmtT(d.tempResult) + ' hat.' });
      if (d.restTime > 0) {
        lastStepOfEvent = add({ phase: 'mash', title: dn + ': Rast ' + fmtT(d.tempResult) + ' · ' + fmtNum(d.restTime, 1) + ' min', sub: restName(d.tempResult),
          temp: T(d.tempResult, 'Maische halten', 'hold'), stir: 'on',
          do: 'Halte die Maische ' + fmtNum(d.restTime, 1) + ' Minuten auf ' + fmtT(d.tempResult) + '. Rührwerk laufen lassen.',
          timer: { kind: 'rest', minutes: d.restTime, label: dn + ' Rast' } });
        lastRestStep = lastStepOfEvent;
      }
      if (d.tempResult !== null) curT = d.tempResult;
    }
    if (i === spargeEvt && lastStepOfEvent) lastStepOfEvent.checks.push(spargeCheck);
    if (i === jodEvt) {
      jodRestStep = lastRestStep;
      add({ phase: 'mash', title: 'Jodprobe', temp: T(curT, 'Maische halten', 'hold'), stir: 'on', jod: true, jodRest: lastRestStep ? lastRestStep.id : null,
        do: 'Gib etwas Maische (ohne Spelzen) auf einen weißen Teller und tropfe 1–2 Tropfen Jod darauf. Gelb bis braun = jodnormal. Blau, violett oder schwarz = noch Stärke vorhanden.',
        checks: ['Probe ist jodnormal (keine Blaufärbung)'],
        info: ['Nicht jodnormal? Tippe auf „Rast +10 min“. Die App geht zurück zur letzten Rast und verlängert sie.'] });
    }
  });
  if (!events.length) S[S.length - 1].checks.push(spargeCheck);

  if (curT < mashOut - 0.4) {
    add({ phase: 'mash', title: 'Abmaischen: auf ' + fmtT(mashOut) + ' aufheizen', temp: T(mashOut, 'Maische · Abmaischtemperatur', 'heat'), stir: 'on',
      do: 'Stelle den Einkochtopf auf ' + fmtT(mashOut) + ' und heize unter Rühren auf. Bestätige, wenn die Maische ' + fmtT(mashOut) + ' hat. Nicht über 80 °C.' });
  } else {
    add({ phase: 'mash', title: 'Abmaischtemperatur ' + fmtT(mashOut) + ' prüfen', temp: T(mashOut, 'Maische · Abmaischtemperatur', 'hold'), stir: 'on',
      do: 'Miss die Maischetemperatur. Sie muss ' + fmtT(mashOut) + ' haben. Danach geht es zum Läutern.' });
  }

  /* --- Läutern --- */
  var lTemp = T(spargeT, 'Nachguss (zweiter Topf)', 'hold');
  add({ phase: 'lauter', title: 'Maische in den Läuterbottich', temp: T(null, 'Einkochtopf AUS', 'off'), stir: 'off',
    do: 'Schalte Einkochtopf und Rührwerk aus. Fülle die gesamte Maische in den Läuterbottich (Hahn geschlossen).' });
  add({ phase: 'lauter', title: 'Läuterruhe 15 min', temp: lTemp, stir: 'off',
    do: 'Nicht rühren. Der Treber setzt sich und bildet den Filterkuchen.',
    timer: { kind: 'rest', minutes: 15, label: 'Läuterruhe' },
    checks: ['Einkochtopf ausgespült und unter den Läuterhahn gestellt (Läuterbottich steht höher)', 'Nachguss hat ' + fmtT(spargeT)],
    info: ['Die Nachgusstemperatur entspricht der Abmaischtemperatur aus dem Rezept.'] });
  if (fwh.length) {
    add({ phase: 'lauter', title: 'Vorderwürzehopfen vorlegen', temp: lTemp, stir: 'off',
      do: 'Gib den Vorderwürzehopfen in den leeren Einkochtopf, bevor die Würze hineinläuft.',
      items: fwh.map(function (h) { return { label: 'Vorderwürze', value: hopLabel(h) }; }),
      checks: fwh.map(function (h) { return hopLabel(h) + ' im Einkochtopf'; }) });
  }
  add({ phase: 'lauter', title: 'Trübwürze zurückführen', temp: lTemp, stir: 'off',
    do: 'Öffne den Läuterhahn langsam. Fange die trüben ersten Liter in einem Messbecher auf und gieße sie vorsichtig zurück auf den Treber, bis die Würze klar läuft.',
    info: ['Über einen Löffel zurückgießen, damit der Treberkuchen nicht aufgewühlt wird.'] });
  add({ phase: 'lauter', title: 'Vorderwürze ablaufen lassen', temp: lTemp, stir: 'off',
    do: 'Lass die klare Würze in den Einkochtopf laufen, bis die Flüssigkeit nur noch knapp über dem Treber steht. Der Treber darf nie trockenfallen.' });
  add({ phase: 'lauter', title: 'Nachguss aufgießen: ' + fmtL(R.spargeWater), temp: lTemp, stir: 'off',
    do: 'Gieße die ' + fmtL(R.spargeWater) + ' Nachguss (' + fmtT(spargeT) + ') portionsweise auf. Es sollen immer 1–2 cm Flüssigkeit über dem Treber stehen. Läutere, bis der gesamte Nachguss durchgelaufen ist.',
    items: [{ label: 'Nachguss', value: fmtL(R.spargeWater) + ' bei ' + fmtT(spargeT) }],
    checks: ['Einkochtopf auf Kochstufe gestellt, sobald das Heizelement bedeckt ist', 'Gesamter Nachguss durchgelaufen, Läuterhahn geschlossen'],
    info: ['Stockt der Ablauf: Treberoberfläche vorsichtig mit einem Messer einschneiden, nicht umrühren.'] });

  /* --- Kochen --- */
  var B = R.boilTime;
  var groups = {};
  function grp(t) { var k = t >= B ? B : (t <= 0 ? 0 : t); groups[k] = groups[k] || []; return groups[k]; }
  R.hops.filter(function (h) { return h.type === 'boil'; }).forEach(function (h) { grp(h.time).push({ label: 'Hopfen', value: hopLabel(h) }); });
  R.boilAdds.forEach(function (z) { grp(z.time).push({ label: 'Zutat', value: addLabel(z) }); });
  var times = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; });
  var SUGAR = /zucker|kandis|candi|honig|sirup|malzextrakt|laktose|lactose|dextrose|glukose|glucose|melasse/i;
  function hasSugar(items) { return items.some(function (it) { return SUGAR.test(it.value); }); }
  var SUGAR_TXT = ' Zucker langsam unter Rühren einrieseln lassen und weiterrühren, bis er sich ganz gelöst hat. Sonst sinkt er zu Boden und brennt am Heizboden an.';

  add({ phase: 'boil', title: 'Zum Kochen bringen', temp: T(100, 'Würze · Kochen', 'boil'), stir: 'off',
    do: 'Einkochtopf auf höchste Stufe. Zum Aufheizen darf der Deckel drauf. Sobald die Würze kocht: Deckel abnehmen. Bestätige, wenn die Würze sprudelnd kocht und der Deckel ab ist.',
    checks: ['Deckel abgenommen'],
    info: ['Beim ersten Aufwallen schäumt die Würze stark: dabeibleiben, notfalls kurz Hitze reduzieren.', 'Während des Kochens bleibt der Topf offen, damit unerwünschte Aromastoffe (DMS) verdampfen können.'] });
  var startItems = groups[B] || [];
  add({ phase: 'boil', title: 'Kochbeginn: ' + fmtNum(B, 0) + ' min Kochzeit starten', temp: T(100, 'Würze · kochen · Deckel offen', 'boil'), stir: hasSugar(startItems) ? 'on' : 'off',
    do: (startItems.length ? 'Gib jetzt die Gaben zu Kochbeginn in die kochende Würze.' + (hasSugar(startItems) ? SUGAR_TXT : '') + ' ' : '') + 'Der Deckel bleibt während der gesamten Kochzeit offen. Mit OK startet die Kochzeit von ' + fmtNum(B, 0) + ' Minuten.',
    items: startItems.map(function (it) { return { label: it.label + ' · ' + fmtNum(B, 0) + ' min', value: it.value }; }),
    checks: ['Deckel ist ab'].concat(startItems.map(function (it) { return it.value + ' zugegeben'; })),
    timer: { kind: 'boilStart', minutes: B } });
  times.forEach(function (t) {
    if (t >= B || t <= 0) return;
    var g = groups[t];
    add({ phase: 'boil', title: 'Gabe bei noch ' + fmtNum(t, 1) + ' min Kochzeit', temp: T(100, 'Würze · kochen · Deckel offen', 'boil'), stir: hasSugar(g) ? 'on' : 'off',
      do: 'Gib bei ' + fmtNum(t, 1) + ' Minuten Restkochzeit zu: ' + g.map(function (x) { return x.value; }).join(', ') + '.' + (hasSugar(g) ? SUGAR_TXT : '') + ' Deckel bleibt offen.',
      items: g.map(function (it) { return { label: it.label + ' · ' + fmtNum(t, 1) + ' min', value: it.value }; }),
      checks: g.map(function (it) { return it.value + ' zugegeben'; }),
      timer: { kind: 'boilAt', at: t } });
  });
  var endItems = groups[0] || [];
  add({ phase: 'boil', title: 'Kochende', temp: T(null, 'Deckel offen · bei 0:00 AUS', 'boil'), stir: hasSugar(endItems) ? 'on' : 'off',
    do: 'Deckel bleibt offen. Wenn die Kochzeit abgelaufen ist: Einkochtopf ausschalten.' + (endItems.length ? ' Dann sofort die Gaben bei Kochende zugeben.' + (hasSugar(endItems) ? SUGAR_TXT : '') : ''),
    items: endItems.map(function (it) { return { label: it.label + ' · 0 min', value: it.value }; }),
    checks: ['Einkochtopf ausgeschaltet'].concat(endItems.map(function (it) { return it.value + ' zugegeben'; })),
    timer: { kind: 'boilEnd' } });

  /* --- Whirlpool & Kühlen --- */
  var wpTime = 15, wpFromRecipe = false;
  wph.forEach(function (h) { if (h.time && h.time > 0) { wpTime = Math.max(wpFromRecipe ? wpTime : 0, h.time); wpFromRecipe = true; } });
  if (wph.length) {
    add({ phase: 'whirl', title: 'Whirlpoolhopfen zugeben', temp: T(null, 'Einkochtopf AUS', 'off'), stir: 'off',
      do: 'Gib den Whirlpoolhopfen direkt nach Kochende in die heiße Würze.',
      items: wph.map(function (h) { return { label: 'Whirlpool', value: hopLabel(h) }; }),
      checks: wph.map(function (h) { return hopLabel(h) + ' zugegeben'; }),
      info: ['Der Rezept-Export nennt keine Temperatur für den Whirlpoolhopfen, deshalb erfolgt die Zugabe direkt nach Kochende.'] });
  }
  add({ phase: 'whirl', title: 'Whirlpool starten', temp: T(null, 'Einkochtopf AUS', 'off'), stir: 'hard',
    do: 'Rühre die Würze 1–2 Minuten kräftig im Kreis, bis ein Strudel entsteht. Dann Löffel heraus, Deckel drauf.',
    info: ['Vorher 2–3 Minuten warten, bis die Würze ruhig ist. Rührwerk vorher abnehmen.'] });
  add({ phase: 'whirl', title: 'Whirlpool-Ruhe ' + fmtNum(wpTime, 0) + ' min', temp: T(null, 'Einkochtopf AUS', 'off'), stir: 'off',
    do: 'Nicht rühren, Topf nicht bewegen. Hopfen und Eiweiß setzen sich als Kegel in der Mitte ab.',
    timer: { kind: 'rest', minutes: wpTime, label: 'Whirlpool-Ruhe' },
    info: wpFromRecipe ? ['Ruhezeit aus der Zeitangabe des Whirlpoolhopfens im Rezept.'] : [] });
  add({ phase: 'whirl', title: 'Heiße Würze in den Gärbehälter umfüllen', temp: T(null, 'Einkochtopf AUS', 'off'), stir: 'off',
    do: 'Lass die heiße Würze über den Hahn langsam in den gereinigten, hitzebeständigen Gärbehälter laufen. Der Trubkegel bleibt im Topf. Schlauch bis zum Boden führen, nicht plätschern lassen.',
    checks: ['Würze im Gärbehälter, Trubkegel im Topf geblieben', 'Gärbehälter sofort mit Deckel verschlossen'],
    info: ['Heiße Würze nicht belüften: Sauerstoff bei hoher Temperatur fördert Fehlaromen. Belüftet wird erst nach dem Abkühlen.', 'Der Gärbehälter muss für fast kochende Würze geeignet sein (z. B. Gäreimer aus PP oder Edelstahl).'] });
  var lager = pMax !== null && pMax < 15;
  add({ phase: 'whirl', title: 'Abkühlen lassen' + (pMax !== null ? ' auf höchstens ' + fmtT(pMax) : ''), temp: TM(pMax, 'Würze abkühlen auf höchstens', 'cool'), stir: 'off',
    do: 'Lass die Würze im geschlossenen Gärbehälter abkühlen, bis sie ' + (pMax !== null ? 'höchstens ' + fmtT(pMax) + ' hat (obere Grenze der Gärtemperatur laut Rezept: ' + ferm + ' °C)' : 'die Gärtemperatur laut Hefehersteller hat') + '. Ohne Kühlung dauert das meist bis zum nächsten Tag.',
    items: R.fermTemp ? [{ label: 'Gärtemperatur laut Rezept', value: ferm + ' °C' }] : [],
    checks: [pMax !== null ? 'Würze hat höchstens ' + fmtT(pMax) + ' (mit desinfiziertem Thermometer gemessen)' : 'Würze hat Gärtemperatur (mit desinfiziertem Thermometer gemessen)'],
    info: ['Deckel bis zum Anstellen geschlossen lassen. Stell den Gärbehälter an den kühlsten Ort, den du hast (Keller, Flur, im Winter draußen geschützt). Im Sommer hilft ein Wasserbad in Wanne oder Mörtelkübel mit gefrorenen Wasserflaschen.']
      .concat(lager ? ['Untergärige Hefe: ' + ferm + ' °C erreichst du ohne Kühlung meist nur im kalten Keller oder im Winter. Ist es wärmer, gärt das Bier mit Fehlaromen. Plane den Brautag danach oder nimm eine obergärige Hefe.'] : []) });

  /* --- Anstellen --- */
  add({ phase: 'pitch', title: 'Stammwürze und Menge messen', temp: TM(pMax, 'Würze höchstens', 'cool'), stir: 'off', calc: 'og',
    do: 'Nimm mit desinfiziertem Werkzeug eine Probe und miss die Stammwürze. Lies die Würzemenge am Gärbehälter ab. ' + (R.og !== null ? 'Ziel laut Rezept: ' + fmtNum(R.og, 1) + ' °P.' : 'Das Rezept nennt keine Stammwürze.'),
    items: (R.og !== null ? [{ label: 'Stammwürze Ziel', value: fmtNum(R.og, 1) + ' °P' }] : []).concat(R.batchL !== null ? [{ label: 'Ausschlagwürze', value: fmtL(R.batchL) + ' (bei 100 °C gemessen)' }] : []),
    checks: ['Stammwürze gemessen und notiert'],
    info: ['Liegt die Stammwürze deutlich über dem Ziel, mit abgekochtem, abgekühltem Wasser verdünnen. Im Gärbehälter ist es weniger als die Ausschlagwürze (Trub, Verdampfung, Abkühlung).'] });
  add({ phase: 'pitch', title: 'Belüften und Hefe zugeben', temp: TM(pMax, 'Anstelltemperatur höchstens', 'cool'), stir: 'hard',
    do: 'Belüfte zuerst die abgekühlte Würze: Gärbehälter verschlossen kräftig schwenken oder mit desinfiziertem Löffel 1–2 Minuten kräftig rühren. Gib dann die Hefe zu: ' + (R.yeast || 'Hefe laut Rezept') + '. Verschließe den Gärbehälter und setze das Gärröhrchen auf.',
    items: [{ label: 'Hefe', value: R.yeast || '–' }, { label: 'Gärtemperatur', value: R.fermTemp ? R.fermTemp + ' °C' : '–' }, { label: 'Endvergärungsgrad', value: R.attenuation !== null ? fmtNum(R.attenuation, 0) + ' %' : '–' }],
    checks: ['Würze belüftet', 'Hefe zugegeben', 'Gärbehälter verschlossen, Gärröhrchen gefüllt'],
    info: ['Trockenhefe nach Herstellerangabe aufstreuen oder rehydrieren, Flüssighefe direkt zugeben.'] });

  /* --- Gärung & Abfüllen --- */
  var fT = T(pT, 'Gärtemperatur laut Rezept', 'hold'); if (ferm) fT.display = ferm;
  add({ phase: 'ferm', title: 'Hauptgärung', temp: fT, stir: 'off',
    do: 'Stell den verschlossenen Gärbehälter an einen Ort mit möglichst gleichmäßiger Temperatur' + (ferm ? ', ideal im Bereich ' + ferm + ' °C' : '') + '. Gärbehälter nicht öffnen.',
    items: [{ label: 'Gärtemperatur laut Rezept', value: R.fermTemp ? R.fermTemp + ' °C' : '–' }, { label: 'Hefe', value: R.yeast || '–' }],
    checks: ['Gärung hat begonnen (Gärröhrchen blubbert, Schaumdecke)'],
    info: ['Ohne Kühlung: Nimm den kühlsten gleichmäßigen Ort. Die Gärung selbst erwärmt das Bier um 2–4 °C. Zu warm vergoren schmeckt es leicht nach Lösungsmittel, zu kalt gärt es nur langsam.', 'Die App überwacht die Gärung nicht. Bestätige den nächsten Schritt, wenn er ansteht. Dein Fortschritt bleibt gespeichert.'] });

  var noteInfo = R.note ? ['Der Export enthält keinen Zeitpunkt. Plane die Zugabe nach der Anmerkung des Autors (Menü „Rezept“).'] : ['Der Export enthält keinen Zeitpunkt für diese Zugabe.'];
  R.dryHops.forEach(function (h, i) {
    add({ phase: 'ferm', title: 'Hopfenstopfen: ' + fmtAmount(h.amount, 'g') + ' ' + h.name, temp: T(null, 'Gärung', 'off'), stir: 'off',
      do: 'Gib ' + fmtAmount(h.amount, 'g') + ' ' + h.name + ' in den Gärbehälter (Hopfenstopfen).',
      items: [{ label: 'Stopfhopfen ' + (i + 1), value: fmtAmount(h.amount, 'g') + ' ' + h.name }],
      checks: [fmtAmount(h.amount, 'g') + ' ' + h.name + ' zugegeben'], info: noteInfo });
  });
  R.fermAdds.forEach(function (z) {
    add({ phase: 'ferm', title: 'Zugabe zur Gärung: ' + addLabel(z), temp: T(null, 'Gärung', 'off'), stir: 'off',
      do: 'Gib ' + addLabel(z) + ' zum Gärbehälter.',
      items: [{ label: 'Weitere Zutat Gärung', value: addLabel(z) }],
      checks: [addLabel(z) + ' zugegeben'], info: noteInfo });
  });
  var re = (R.og !== null && R.attenuation !== null) ? R.og * (1 - R.attenuation / 100) : null;
  add({ phase: 'ferm', title: 'Endvergärung prüfen', temp: fT, stir: 'off', safety: true, calc: 'fg',
    do: 'Miss den Restextrakt mit der Spindel an 2–3 aufeinanderfolgenden Tagen. Erst wenn sich der Wert nicht mehr ändert, ist das Bier endvergoren und darf abgefüllt werden.',
    items: (re !== null ? [{ label: 'Erwarteter Restextrakt (scheinbar)', value: 'ca. ' + fmtNum(re, 1) + '\u202F°P' }] : [])
      .concat(R.attenuation !== null ? [{ label: 'Endvergärungsgrad laut Rezept', value: fmtNum(R.attenuation, 0) + ' %' }] : []),
    checks: ['Restextrakt an mindestens 2 Tagen hintereinander unverändert', 'Restextrakt liegt beim erwarteten Wert (deutlich darüber: NICHT abfüllen)'],
    info: ['Liegt der Restextrakt deutlich über dem erwarteten Wert, kann die Gärung stecken geblieben sein. Abgefüllt gärt das Bier in der Flasche weiter: Flaschen können platzen.',
      'Ein Refraktometer zeigt nach Gärbeginn wegen des Alkohols falsche Werte. Nimm die Spindel oder rechne den Wert um.'] });
  add({ phase: 'ferm', title: 'Abfüllen mit Zucker (Flaschengärung)', temp: T(null, 'Abfüllen', 'off'), stir: 'off', calc: 'carb', safety: true,
    do: 'Fülle das endvergorene Bier mit Zucker für die Nachgärung in Flaschen.' + (R.carbonation !== null ? ' Karbonisierung laut Rezept: ' + fmtNum(R.carbonation, 1) + ' g/l CO₂.' : ' Das Rezept nennt keine Karbonisierung.'),
    items: R.carbonation !== null ? [{ label: 'Karbonisierung laut Rezept', value: fmtNum(R.carbonation, 1) + ' g/l CO₂' }] : [],
    checks: ['Ich habe den Sicherheitshinweis gelesen und trage die volle Verantwortung für Zuckermenge und Abfüllung', 'Nur unbeschädigte, für Kohlensäuredruck geeignete Flaschen verwendet', 'Flaschen und Verschlüsse gereinigt und desinfiziert'],
    info: ['Zucker in wenig Wasser aufkochen, abkühlen lassen und vorsichtig unter das Bier im Abfülleimer rühren (nicht schäumen lassen). Bodensatz im Gärbehälter lassen.'] });
  add({ phase: 'ferm', title: 'Nachgärung und Lagerung', temp: T(20, 'Nachgärung · Raumtemperatur', 'hold'), stir: 'off', safety: true,
    do: 'Lagere die Flaschen 1–2 Wochen bei etwa 18–22 °C in einer geschlossenen Kiste. Prüfe den Druck mit einer PET-Testflasche. Ist sie prall, stelle alle Flaschen kühl (unter 8 °C).',
    checks: ['Flaschen stehen in einer geschlossenen Kiste (Schutz bei Flaschenbruch)', 'Testflasche ist prall, Flaschen stehen kühl'],
    info: ['Wird die Testflasche hart wie Stein oder hörst du Flaschen platzen: Kiste nicht mit bloßen Händen öffnen, Schutzbrille und Handschuhe tragen, Flaschen kühlen und vorsichtig entlüften.'] });
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
    if (e.k === 'r') { rn++; goTo(e.r.temp); hold(e.r.time, 'Rast ' + rn + ' · ' + restName(e.r.temp)); }
    else {
      var d = e.d; var dur = (d.partRestTime || 0) + (d.partBoilTime || 0) + 15;
      segs.push({ t0: t, t1: t + dur, temp: T0, label: 'Dekoktion (Teilmaische)', dec: true }); t += dur; pts.push([t, T0]);
      if (d.tempResult !== null) { T0 = d.tempResult; pts.push([t, T0]); }
      hold(d.restTime, 'Rast nach Dekoktion');
    }
  });
  goTo(R.mashOutTemp);
  pts.push([t + 5, T0]); segs.push({ t0: t, t1: t + 5, temp: T0, label: 'Abmaischen', mashout: true }); t += 5;
  return { pts: pts, segs: segs, total: t };
}

if (typeof module !== 'undefined') module.exports = { xmlParse: xmlParse, beerxmlToMmum: beerxmlToMmum, beerjsonToMmum: beerjsonToMmum, abvFromGravity: abvFromGravity, primingAbv: primingAbv, apparentAttenuation: apparentAttenuation, residualCO2: residualCO2, carbSugar: carbSugar, maxFermTemp: maxFermTemp, platoToSG: platoToSG, sgToPlato: sgToPlato, hydroCorrect: hydroCorrect, brixToPlato: brixToPlato, ogAdvice: ogAdvice, parseRecipe: parseRecipe, buildSteps: buildSteps, scaleRecipe: scaleRecipe, mashProfile: mashProfile, fmtNum: fmtNum, pitchTemp: pitchTemp, maltTotalKg: maltTotalKg };
