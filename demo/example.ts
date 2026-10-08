// A short example written for this demo (a C major scale up and down, with a
// chord to finish, over a bass line), so the page shows something before a
// file is opened. Two parts, each naming its instrument, so the parts' colors,
// mute, solo and sounds show too.
export const EXAMPLE_MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.1">
  <meiHead><fileDesc><titleStmt><title>Example: C major scale</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4" midi.bpm="100">
      <staffGrp>
        <staffDef n="1" lines="5" clef.shape="G" clef.line="2"><label>Lead</label><instrDef midi.instrnum="80"/></staffDef>
        <staffDef n="2" lines="5" clef.shape="F" clef.line="4"><label>Bass</label><instrDef midi.instrnum="39"/></staffDef>
      </staffGrp>
    </scoreDef>
    <section>
      <measure n="1">
        <staff n="1"><layer n="1">
          <note pname="c" oct="4" dur="4"/><note pname="d" oct="4" dur="4"/><note pname="e" oct="4" dur="4"/><note pname="f" oct="4" dur="4"/>
        </layer></staff>
        <staff n="2"><layer n="1"><note pname="c" oct="3" dur="2"/><note pname="g" oct="2" dur="2"/></layer></staff>
      </measure>
      <measure n="2">
        <staff n="1"><layer n="1">
          <note pname="g" oct="4" dur="4"/><note pname="a" oct="4" dur="4"/><note pname="b" oct="4" dur="4"/><note pname="c" oct="5" dur="4"/>
        </layer></staff>
        <staff n="2"><layer n="1"><note pname="e" oct="2" dur="2"/><note pname="f" oct="2" dur="2"/></layer></staff>
      </measure>
      <measure n="3">
        <staff n="1"><layer n="1">
          <note pname="b" oct="4" dur="8"/><note pname="a" oct="4" dur="8"/><note pname="g" oct="4" dur="8"/><note pname="f" oct="4" dur="8"/>
          <note pname="e" oct="4" dur="8"/><note pname="d" oct="4" dur="8"/><note pname="c" oct="4" dur="4"/>
        </layer></staff>
        <staff n="2"><layer n="1"><note pname="g" oct="2" dur="2"/><note pname="g" oct="2" dur="2"/></layer></staff>
      </measure>
      <measure n="4">
        <staff n="1"><layer n="1">
          <chord dur="1"><note pname="c" oct="4"/><note pname="e" oct="4"/><note pname="g" oct="4"/><note pname="c" oct="5"/></chord>
        </layer></staff>
        <staff n="2"><layer n="1"><note pname="c" oct="2" dur="1"/></layer></staff>
      </measure>
    </section>
  </score></mdiv></body></music>
</mei>`
