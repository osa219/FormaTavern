import { describe, it, expect } from 'bun:test';
import { normalizeHtmlQuirks } from '../../src/text/htmlQuirks';
import { parseEnvelope } from '../../src/envelope';

describe('normalizeHtmlQuirks (post-parse, narrative-safe)', () => {
  it('converts safe subset to markdown', () => {
    expect(normalizeHtmlQuirks('<b>Boston Noir:</b> hardboiled')).toBe('**Boston Noir:** hardboiled');
    expect(normalizeHtmlQuirks('<strong>hi</strong>')).toBe('**hi**');
    expect(normalizeHtmlQuirks('<i>italic</i> and <em>also</em>')).toBe('*italic* and *also*');
    expect(normalizeHtmlQuirks('<s>old</s> <del>gone</del> <strike>out</strike>')).toBe('~~old~~ ~~gone~~ ~~out~~');
    expect(normalizeHtmlQuirks('a<br>b<br/>c<br />d')).toBe('a\nb\nc\nd');
  });

  it('keeps <u> but strips attributes, handles case and attributes', () => {
    expect(normalizeHtmlQuirks('<B CLASS="x">hi</B>')).toBe('**hi**');
    expect(normalizeHtmlQuirks('<u style="color:red">under</u>')).toBe('<u>under</u>');
    expect(normalizeHtmlQuirks('<I>Hi</I>')).toBe('*Hi*');
  });

  it('drops unknown tags but keeps inner text (no literals, no effect)', () => {
    expect(normalizeHtmlQuirks('<div>raw html block</div>')).toBe('raw html block');
    expect(normalizeHtmlQuirks('<span>inline</span>')).toBe('inline');
    expect(normalizeHtmlQuirks('<font color="red">colored</font>')).toBe('colored');
    expect(normalizeHtmlQuirks('<script>alert(1)</script>')).toBe('alert(1)');
    const out = normalizeHtmlQuirks('<div style="x">a <b>b</b> c</div>');
    expect(out).toBe('a **b** c');
    expect(out).not.toContain('<div');
    expect(out).not.toContain('&lt;');
  });

  it('never touches narrative tags even if called pre-parse', () => {
    const xml = '<character name="Alice">Run!</character>';
    expect(normalizeHtmlQuirks(xml)).toBe(xml);
    expect(normalizeHtmlQuirks('<narrator>Rain falls.</narrator>')).toBe('<narrator>Rain falls.</narrator>');
    expect(normalizeHtmlQuirks('<npc name="Danny">Hey.</npc>')).toBe('<npc name="Danny">Hey.</npc>');
    expect(normalizeHtmlQuirks('<persona>Hi</persona>')).toBe('<persona>Hi</persona>');
    expect(normalizeHtmlQuirks('<state>{"mood":"calm"}</state>')).toBe('<state>{"mood":"calm"}</state>');
    expect(normalizeHtmlQuirks('<think>reasoning</think>')).toBe('<think>reasoning</think>');
  });

  it('preserves fenced and inline code verbatim', () => {
    expect(normalizeHtmlQuirks('```\n<b>not bold</b>\n```')).toBe('```\n<b>not bold</b>\n```');
    expect(normalizeHtmlQuirks('Run `<b>` in bash')).toBe('Run `<b>` in bash');
  });

  it('is idempotent and handles unclosed tags', () => {
    const once = normalizeHtmlQuirks('<b>bold');
    expect(once).toBe('**bold');
    expect(normalizeHtmlQuirks(once)).toBe(once);
    expect(normalizeHtmlQuirks('plain text')).toBe('plain text');
    expect(normalizeHtmlQuirks('')).toBe('');
  });

  it('keeps all three dialects parseable with HTML slop inside bodies', () => {
    const directive = ':::narrator\nThe menu opens.\n:::\n\n:::character[John]\n<b>Boston Noir:</b> A detective story.\n:::\n\n```state\n{"mood":"calm"}\n```';
    const d = parseEnvelope(directive, { primaryCharacter: 'John', dialect: 'directive' });
    expect(d.dialect).toBe('directive');
    expect(d.segments.length).toBe(2);
    expect(normalizeHtmlQuirks(d.segments[1].text)).toBe('**Boston Noir:** A detective story.');

    const xml = '<narrator>Rain falls.</narrator>\n<npc name="Danny"><b>Hey.</b> Come in.</npc>\n<state>\n{"mood":"calm"}\n</state>';
    const x = parseEnvelope(xml, { primaryCharacter: 'John', dialect: 'xml' });
    expect(x.dialect).toBe('xml');
    expect(x.segments.some((s) => s.kind === 'npc' && s.name === 'Danny')).toBe(true);
    const npc = x.segments.find((s) => s.kind === 'npc')!;
    expect(normalizeHtmlQuirks(npc.text)).toBe('**Hey.** Come in.');

    const prefix = 'Narrator: The menu opens.\nDanny: <b>Hey.</b> Come in.';
    const p = parseEnvelope(prefix, { primaryCharacter: 'John', dialect: 'prefix', knownNames: ['Danny'] });
    expect(p.segments.some((s) => s.kind === 'npc' && s.name === 'Danny')).toBe(true);
  });
});
