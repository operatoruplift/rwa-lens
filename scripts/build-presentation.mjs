/** Rebuild the offline pitch, print PDF, editable PowerPoint and presenter notes.
 * Content lives in docs/pitch/deck-content.json. Font, artwork and brand stay local.
 * Requires Playwright Chromium and pptxgenjs (resolve via NODE_PATH when bundled).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/presentation');
const docs = join(root, 'docs/pitch');
const deck = JSON.parse(readFileSync(join(docs, 'deck-content.json'), 'utf8'));
const font = readFileSync(join(root, 'public/brand-kit/source/Inter-latin.woff2')).toString('base64');
const art = `data:image/webp;base64,${readFileSync(join(root, 'public/brand/lens-hero.webp')).toString('base64')}`;
const colours = { ink: '101211', ivory: 'F2F2E9', citron: 'D9FF65', muted: 'A4AAA2' };
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const num = value => String(value).padStart(2, '0');
mkdirSync(out, { recursive: true });

const mark = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16"/><ellipse cx="20" cy="20" rx="9" ry="16" transform="rotate(38 20 20)"/><circle class="focus-dot" cx="31.3" cy="8.7" r="3.6"/></svg>`;
const heading = (value, tag) => `<${tag}>${value.split('\n').map((line, i) => `<span${i ? ' class="accent-line"' : ''}>${esc(line)}</span>`).join('')}</${tag}>`;
const slideHtml = (slide, index) => {
  const isCover = ['cover', 'close'].includes(slide.kind);
  const cards = slide.items ? `<div class="items ${slide.kind}">${slide.items.map((item, i) => `<article class="item"><span class="item-label">${esc(item.label)}</span><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${['flow', 'architecture', 'equation'].includes(slide.kind) && i < 2 ? '<span class="connector" aria-hidden="true">↗</span>' : ''}</article>`).join('')}</div>` : '';
  return `<section class="slide ${slide.theme} ${slide.kind}" id="slide-${num(index + 1)}" aria-roledescription="slide" aria-label="${index + 1} of ${deck.slides.length}: ${esc(slide.title.replaceAll('\n', ' '))}" tabindex="-1">
    ${isCover ? `<div class="art" aria-hidden="true"><img src="${art}" alt=""/><span class="art-shade"></span></div>` : '<div class="registration" aria-hidden="true">+</div>'}
    <header class="slide-top"><a class="brand" href="${deck.url}" target="_blank" rel="noopener">${mark}<span>RWA Lens</span></a><span class="edition">${esc(deck.edition)}</span></header>
    <div class="slide-content"><p class="eyebrow reveal">${esc(slide.section)}</p><div class="reveal headline">${heading(slide.title, index === 0 ? 'h1' : 'h2')}<p class="summary">${esc(slide.summary)}</p></div>${cards ? `<div class="reveal body-content">${cards}</div>` : ''}${slide.note ? `<p class="slide-note reveal">${esc(slide.note)}</p>` : ''}${slide.kind === 'demo' ? `<a class="action reveal" href="${deck.url}/demo" target="_blank" rel="noopener">Open live demo <span aria-hidden="true">↗</span></a>` : ''}${isCover ? `<div class="cover-links reveal"><a href="${deck.url}${slide.kind === 'cover' ? '/demo' : ''}" target="_blank" rel="noopener">${slide.kind === 'cover' ? 'Explore the live product' : 'rwalensonsolana.vercel.app'} <span aria-hidden="true">↗</span></a>${slide.kind === 'close' ? `<a href="${deck.url}/technical" target="_blank" rel="noopener">Technical breakdown ↗</a>` : '<span class="tag">READ-ONLY · MAINNET</span>'}</div>` : ''}</div>
    <footer class="slide-bottom"><span>REAL ASSETS. CLEARER VISION.</span><span>${num(index + 1)} / ${num(deck.slides.length)}</span></footer><aside class="speaker-note" hidden>${esc(slide.notes)}</aside></section>`;
};
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="RWA Lens: a mainnet token intelligence product on Solana. Interactive pitch with presenter notes."><title>${esc(deck.title)}</title><style>
@font-face{font-family:Lens;src:url(data:font/woff2;base64,${font}) format('woff2');font-style:normal;font-weight:100 900;font-display:swap}
/* Viewport-fitting base: one slide is exactly one viewport. */
html,body{height:100%;overflow-x:hidden}html{scroll-snap-type:y mandatory;scroll-behavior:smooth}*{box-sizing:border-box}body{margin:0;background:#101211;font-family:Lens,Arial,sans-serif;color:#f2f2e9}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit}a{color:inherit;text-underline-offset:5px}button:focus-visible,a:focus-visible{outline:3px solid currentColor;outline-offset:5px}.slide:focus{outline:none}
:root{--title-size:clamp(2.4rem,5.6vw,6.8rem);--h2-size:clamp(2rem,4.3vw,5.25rem);--h3-size:clamp(1.1rem,1.8vw,2rem);--body-size:clamp(.95rem,1.28vw,1.4rem);--small-size:clamp(.75rem,.9vw,1rem);--slide-padding:clamp(1.25rem,4.4vw,6rem);--content-gap:clamp(1rem,2.3vh,2rem);--element-gap:clamp(.5rem,1vw,1rem)}
.slide{width:100vw;height:100vh;height:100dvh;overflow:hidden;scroll-snap-align:start;display:flex;flex-direction:column;position:relative;isolation:isolate;--line:#353a34;--muted:#b6bdb3;background:#101211;color:#f2f2e9}.slide.ivory{background:#f2f2e9;color:#101211;--line:#c9cec1;--muted:#50594d}.slide.citron{background:#d9ff65;color:#101211;--line:#94b33e;--muted:#3c4f1f}.slide-top,.slide-bottom{display:flex;justify-content:space-between;align-items:center;position:absolute;left:var(--slide-padding);right:var(--slide-padding);z-index:2}.slide-top{top:clamp(1rem,3.6vh,2.5rem)}.slide-bottom{bottom:clamp(.8rem,2.7vh,2rem);border-top:1px solid var(--line);padding-top:clamp(.7rem,1.6vh,1rem);font-size:var(--small-size);letter-spacing:.12em}.brand{display:flex;align-items:center;gap:clamp(.45rem,.7vw,.8rem);text-decoration:none;font-size:clamp(1rem,1.45vw,1.6rem);font-weight:550;letter-spacing:-.055em}.brand svg{width:clamp(1.8rem,2.5vw,2.8rem);height:auto;fill:none;stroke:currentColor;stroke-width:2.3}.brand .focus-dot{fill:#d9ff65;stroke:#101211}.ivory .focus-dot,.citron .focus-dot{fill:#101211;stroke:transparent}.edition{font-size:var(--small-size);color:var(--muted);letter-spacing:.04em}.slide-content{flex:1;display:flex;flex-direction:column;justify-content:center;max-height:100%;overflow:hidden;padding:clamp(5.2rem,11vh,8rem) var(--slide-padding) clamp(4.7rem,10vh,7.5rem);gap:var(--content-gap);position:relative;z-index:1}.eyebrow{font-size:var(--small-size);font-weight:600;letter-spacing:.15em;margin:0;color:var(--muted)}h1,h2,h3,p{margin:0}h1,h2{font-size:var(--h2-size);line-height:1.04;letter-spacing:-.065em;font-weight:500}h1,.close h2{font-size:var(--title-size)}h1 span,h2 span{display:block}.dark .accent-line{color:#d9ff65}.summary{max-width:55ch;font-size:var(--body-size);line-height:1.45;letter-spacing:-.018em;color:var(--muted);margin-top:clamp(.9rem,2.2vh,1.6rem)}.items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(1.25rem,2.6vw,3.4rem);margin-top:clamp(.8rem,1.5vh,1.6rem)}.item{border-top:1px solid var(--line);padding-top:clamp(.9rem,2vh,1.5rem);position:relative;min-width:0}.item-label{display:block;font-size:var(--small-size);letter-spacing:.12em;font-weight:600;color:var(--muted);margin-bottom:clamp(1rem,2.7vh,2.2rem)}.item h3{font-size:var(--h3-size);letter-spacing:-.04em;font-weight:550;line-height:1.13;margin-bottom:clamp(.5rem,1.4vh,1rem)}.item p{font-size:var(--body-size);line-height:1.43;color:var(--muted);max-width:30ch}.connector{position:absolute;right:0;top:clamp(.65rem,1.5vh,1rem);font-size:clamp(1.5rem,2vw,2.5rem);color:var(--muted)}.flow .item-label,.architecture .item-label,.equation .item-label{margin-bottom:clamp(1rem,3vh,2.5rem)}.equation .item:last-child{border-color:#9db941}.slide-note{font-size:var(--small-size);line-height:1.4;color:var(--muted);padding-top:clamp(.2rem,.7vh,.6rem)}.action{align-self:flex-start;display:flex;gap:clamp(1rem,4vw,5rem);align-items:center;text-decoration:none;background:#d9ff65;color:#101211;border-radius:99px;padding:clamp(.7rem,1.5vh,1rem) clamp(1rem,1.7vw,2rem);font-size:var(--body-size)}.action span{font-size:1.4em}.registration{position:absolute;right:var(--slide-padding);top:22%;font-size:clamp(2rem,4vw,5rem);font-weight:200;color:var(--line)}.art{position:absolute;inset:0;z-index:0;overflow:hidden}.art img{position:absolute;inset:0;width:100%;height:100%;max-height:none;object-fit:cover;animation:optical-drift 16s ease-in-out infinite alternate}.art-shade{position:absolute;inset:0;background:linear-gradient(90deg,#101211 3%,#101211e8 27%,#101211a8 49%,#10121105 80%)}.cover .slide-content,.close .slide-content{max-width:82vw}.cover .summary,.close .summary{max-width:31ch}.cover-links{display:flex;align-items:center;gap:clamp(1rem,2.5vw,3rem);font-size:var(--body-size);margin-top:clamp(.9rem,2vh,2rem);flex-wrap:wrap}.cover-links a{text-decoration:none;border-bottom:1px solid #70776a;padding-bottom:clamp(.4rem,1vh,.75rem)}.tag{font-size:var(--small-size);letter-spacing:.1em;color:#c5ccb9}.close .cover-links{flex-direction:column;align-items:flex-start}.controls{position:fixed;right:clamp(.5rem,1.5vw,1.5rem);bottom:clamp(.4rem,.8vh,.8rem);z-index:10;display:flex;gap:.25rem;background:#101211e8;color:#f2f2e9;border:1px solid #575e51;border-radius:99px;padding:.2rem}.controls button{border:0;background:transparent;color:inherit;border-radius:99px;min-width:2rem;min-height:2rem;font-size:clamp(.75rem,1vw,1rem);cursor:pointer;padding:.2rem .6rem}.controls button:hover{background:#30362d}.controls button:disabled{opacity:.35;cursor:default}.controls .count{display:flex;align-items:center;font-size:.75rem;padding:0 .45rem;min-width:3.6rem;justify-content:center}.slide-bottom span:last-child{margin-right:clamp(11rem,17vw,16rem)}.progress{position:fixed;top:0;left:0;width:100%;height:3px;background:transparent;z-index:12}.progress span{display:block;width:0;height:100%;background:#d9ff65;transition:width .3s}.reveal{opacity:1;transform:none}.enhanced .slide:not(.visible) .reveal{opacity:.15;transform:translateY(15px)}.reveal{transition:opacity .7s ease,transform .7s ease}.body-content{transition-delay:.08s}.slide-note,.cover-links{transition-delay:.12s}.speaker-dialog{color:#101211;background:#f2f2e9;border:0;border-radius:12px;padding:clamp(1.25rem,3vw,2.5rem);max-width:min(92vw,740px);max-height:85dvh;line-height:1.6}.speaker-dialog::backdrop{background:#0009}.speaker-dialog h2{font-size:clamp(1.5rem,3vw,2rem);margin-bottom:1rem}.speaker-dialog p{font-size:clamp(1rem,1.6vw,1.2rem)}.speaker-dialog form{display:flex;justify-content:flex-end;margin-top:1.5rem}.speaker-dialog button{padding:.7rem 1rem;background:#101211;color:#f2f2e9;border:0;border-radius:99px;cursor:pointer}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.controls .help-label{display:none}
@keyframes optical-drift{from{transform:scale(1.01) translateX(0)}to{transform:scale(1.065) translateX(-1.2%)}}
@media(max-height:700px){:root{--slide-padding:clamp(1.2rem,4vw,3.5rem);--content-gap:clamp(.65rem,1.7vh,1.2rem);--title-size:clamp(2.5rem,5.5vw,5rem);--h2-size:clamp(2rem,4vw,3.7rem)}.item-label{margin-bottom:clamp(.75rem,2vh,1.4rem)}.summary{margin-top:clamp(.65rem,1.6vh,1rem)}}
@media(max-height:600px){:root{--slide-padding:clamp(1rem,3.5vw,3rem);--content-gap:clamp(.5rem,1.2vh,.85rem);--body-size:clamp(.875rem,1.3vw,1rem)}.slide-content{padding-top:clamp(4.1rem,10vh,5rem);padding-bottom:clamp(3.8rem,10vh,5rem)}.registration{display:none}.item-label{margin-bottom:.65rem}.flow .item-label,.architecture .item-label,.equation .item-label{margin-bottom:.65rem}.items{margin-top:.35rem}.item{padding-top:.65rem}}
@media(max-height:500px){:root{--title-size:clamp(2.1rem,5.7vw,3rem);--h2-size:clamp(1.8rem,4.3vw,2.7rem);--h3-size:clamp(1rem,2.6vw,1.35rem);--small-size:clamp(.72rem,1.4vw,.8rem);--content-gap:clamp(.4rem,1.4vh,.7rem)}.slide-content{padding-top:3.5rem;padding-bottom:3.1rem}.slide-top{top:.7rem}.slide-bottom{bottom:.5rem;padding-top:.45rem}.brand{font-size:1rem}.brand svg{width:1.5rem}.edition{font-size:.72rem}.item p{line-height:1.25}.item-label{font-size:.7rem;margin-bottom:.55rem}.summary{margin-top:.45rem;line-height:1.3}.action{padding:.45rem 1rem}.demo .slide-note{display:none}.demo .action{position:absolute;right:var(--slide-padding);bottom:3.2rem}.demo .items{padding-right:0}.demo .item p{max-width:21ch}.eyebrow{font-size:.7rem}.cover-links{margin-top:.5rem}.slide-note{font-size:.73rem}}
@media(max-width:600px) and (min-height:501px){:root{--title-size:clamp(2.4rem,10.3vw,3.8rem);--h2-size:clamp(1.9rem,8vw,3rem);--h3-size:clamp(1rem,4.5vw,1.3rem);--body-size:clamp(.9rem,3.8vw,1.05rem);--small-size:clamp(.7rem,2.9vw,.85rem);--content-gap:clamp(.65rem,1.8vh,1rem)}.slide-content{padding-top:5.1rem;padding-bottom:4.3rem;justify-content:center}.slide-top{top:1rem}.brand{font-size:1.1rem}.brand svg{width:1.7rem}.edition{max-width:12ch;line-height:1.35;text-align:right;font-size:.7rem}.items{grid-template-columns:1fr;gap:clamp(.7rem,1.8vh,1.3rem);margin-top:.3rem}.item{display:grid;grid-template-columns:5rem 1fr;column-gap:.8rem;row-gap:.3rem;padding-top:.65rem}.item-label{grid-row:1/3;font-size:.65rem;letter-spacing:.06em;margin:0;padding-top:.15rem;line-height:1.4}.item h3{margin:0}.item p{grid-column:2;line-height:1.3}.connector{display:none}.flow .item-label,.architecture .item-label,.equation .item-label{margin-bottom:0}.summary{line-height:1.4}.slide-note{font-size:.72rem}.cover .slide-content,.close .slide-content{max-width:100vw}.cover .art img,.close .art img{object-position:68% center;opacity:.68}.art-shade{background:linear-gradient(180deg,#101211a8 0%,#10121170 50%,#101211e8 100%)}.cover-links{flex-direction:column;align-items:flex-start;gap:1rem}.cover h1{font-size:clamp(2.8rem,12vw,4.7rem)}.slide-bottom{font-size:.6rem;letter-spacing:.05em;bottom:.85rem}.slide-bottom span:last-child{margin-right:10.3rem}.controls{right:.5rem;bottom:.4rem}.controls button{min-width:1.8rem;padding:.2rem .35rem}.controls .count{min-width:3rem;padding:0 .1rem}.controls .notes-button{font-size:.7rem}.action{font-size:.875rem;padding:.65rem 1rem}.registration{display:none}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}html{scroll-behavior:auto}.enhanced .slide:not(.visible) .reveal{opacity:1;transform:none}}
@page{size:13.333333in 7.5in;margin:0}@media print{html,body{width:13.333333in;height:auto;overflow:visible;scroll-snap-type:none;background:#101211;-webkit-print-color-adjust:exact;print-color-adjust:exact}.slide{width:13.333333in;height:7.5in;break-after:page;page-break-after:always;break-inside:avoid}.slide:last-child{break-after:auto;page-break-after:auto}.controls,.progress,.speaker-dialog{display:none!important}.slide .reveal{opacity:1!important;transform:none!important}.art img{animation:none}.slide-bottom span:last-child{margin-right:0}.slide-content{padding-top:5.4rem;padding-bottom:4.8rem}.slide-top{top:1.7rem}.slide-bottom{bottom:1.35rem}.cover-links a{text-decoration:none}.action{display:none}.demo .slide-note{display:block}.registration{display:block}}
</style></head><body><div class="progress" aria-hidden="true"><span></span></div><main aria-label="RWA Lens pitch presentation">${deck.slides.map(slideHtml).join('\n')}</main><nav class="controls" aria-label="Presentation controls"><button type="button" class="previous" aria-label="Previous slide">←</button><span class="count" aria-live="polite" aria-atomic="true">01 / ${num(deck.slides.length)}</span><button type="button" class="next" aria-label="Next slide">→</button><button type="button" class="notes-button" aria-haspopup="dialog">Notes</button></nav><dialog class="speaker-dialog" aria-labelledby="notes-heading"><h2 id="notes-heading">Presenter notes</h2><p class="notes-body"></p><form method="dialog"><button>Close notes</button></form></dialog><p class="sr-only">Use arrow keys, Page Up and Page Down, wheel or swipe to move between slides. Press N for notes, Home for the first slide and End for the last.</p><script>
/* Native slide sections retain readable content without scripting. */
class PresentationController {
  constructor(){this.slides=[...document.querySelectorAll('.slide')];this.index=0;this.lockedUntil=0;this.wheel=0;this.dialog=document.querySelector('.speaker-dialog');this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');this.previous=document.querySelector('.previous');this.next=document.querySelector('.next');this.count=document.querySelector('.count');this.progress=document.querySelector('.progress span');this.notes=document.querySelector('.notes-button');this.previous.addEventListener('click',()=>this.go(this.index-1));this.next.addEventListener('click',()=>this.go(this.index+1));this.notes.addEventListener('click',()=>this.showNotes());document.addEventListener('keydown',e=>this.onKey(e));window.addEventListener('wheel',e=>this.onWheel(e),{passive:false});let start=null;window.addEventListener('touchstart',e=>{start=e.touches.length===1&&!this.interactive(e.target)?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null},{passive:true});window.addEventListener('touchend',e=>{if(!start||this.dialog.open)return;const x=start.x-e.changedTouches[0].clientX,y=start.y-e.changedTouches[0].clientY;start=null;if(Math.abs(x)>55&&Math.abs(x)>Math.abs(y))this.go(this.index+(x>0?1:-1));},{passive:true});this.observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{entry.target.classList.toggle('visible',entry.isIntersecting);if(entry.intersectionRatio>.6)this.update(this.slides.indexOf(entry.target));});},{threshold:[0,.6]});this.slides.forEach(s=>this.observer.observe(s));document.documentElement.classList.add('enhanced');const hashIndex=this.slides.findIndex(s=>'#'+s.id===location.hash);this.update(hashIndex>=0?hashIndex:0);this.slides[this.index].classList.add('visible');window.addEventListener('hashchange',()=>{const i=this.slides.findIndex(s=>'#'+s.id===location.hash);if(i>=0)this.go(i)});}
  interactive(target){return target instanceof Element&&Boolean(target.closest('a,button,input,textarea,select,dialog'));}
  go(index){const next=Math.max(0,Math.min(this.slides.length-1,index));this.update(next);this.slides[next].scrollIntoView({behavior:this.motion.matches?'instant':'smooth',block:'start'});history.replaceState(null,'','#'+this.slides[next].id);}
  update(index){this.index=index;this.count.textContent=String(index+1).padStart(2,'0')+' / '+String(this.slides.length).padStart(2,'0');this.previous.disabled=index===0;this.next.disabled=index===this.slides.length-1;this.progress.style.width=((index+1)/this.slides.length*100)+'%';}
  showNotes(){document.querySelector('.notes-body').textContent=this.slides[this.index].querySelector('.speaker-note').textContent;document.querySelector('#notes-heading').textContent='Slide '+(this.index+1)+' / Presenter notes';this.dialog.showModal();}
  onKey(e){if(this.dialog.open||e.altKey||e.ctrlKey||e.metaKey||this.interactive(e.target))return;const next=['ArrowRight','ArrowDown','PageDown',' '].includes(e.key),prev=['ArrowLeft','ArrowUp','PageUp'].includes(e.key);if(next||prev){e.preventDefault();this.go(this.index+(next?1:-1));}else if(e.key==='Home'||e.key==='End'){e.preventDefault();this.go(e.key==='Home'?0:this.slides.length-1);}else if(e.key.toLowerCase()==='n'){e.preventDefault();this.showNotes();}}
  onWheel(e){if(this.dialog.open||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;e.preventDefault();if(performance.now()<this.lockedUntil)return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);this.wheel+=delta;if(Math.abs(this.wheel)>55){this.go(this.index+(this.wheel>0?1:-1));this.wheel=0;this.lockedUntil=performance.now()+750;}}
}
new PresentationController();
</script></body></html>`;
writeFileSync(join(out, 'rwa-lens-pitch.html'), html);

const references = [
  ['Live product', deck.url],
  ['Guided demo', `${deck.url}/demo`],
  ['Technical breakdown', `${deck.url}/technical`],
  ['Source repository', 'https://github.com/operatoruplift/rwa-lens'],
  ['USDY mint address registry', 'https://docs.ondo.finance/addresses'],
  ['Issuer USDY description', 'https://docs.ondo.finance/general-access-products/usdy/basics'],
  ['Solana Scaled UI Amount', 'https://solana.com/docs/tokens/extensions/scaled-ui-amount'],
];
const notes = `# RWA Lens — Presenter notes\n\n${deck.edition}\n\nAudience: Solana ecosystem reviewers, wallet teams, issuers and treasury operators. Suggested duration: 7–9 minutes, plus 3–4 minutes for the live walkthrough.\n\n## Presenting the deck\n\nOpen rwa-lens-pitch.html locally or from /presentation/rwa-lens-pitch.html. Use arrow keys, Page Up / Page Down, wheel, vertical swipe or the visible controls. Horizontal swipe also advances. N opens the current speaker note; Escape closes it. Home and End jump to the first and last slide. The HTML includes its font and artwork and works offline; outbound product and source links require connectivity. The PDF is a shareable fixed-layout copy. The PPTX keeps typography, geometry and diagrams editable; its optical artwork remains a raster image. Install the included Inter font for consistent PowerPoint typography.\n\n## Five-minute live walkthrough\n\n1. Open ${deck.url}/demo. Introduce the read-only public inspection workflow.\n2. Run the USDY mint inspection. Check the full address against the issuer registry and identify its legacy SPL Token program.\n3. Review mint decimals, raw supply and authorities. Separate issuer attribution from independent asset assurance.\n4. Open evidence: show observation time, network, commitment and per-read context slots.\n5. Optionally enter a public owner address supplied by the audience. Explain returned public accounts and preserve partial or unavailable states.\n6. Download JSON and CSV. Open the files and show the connection between the UI and the saved record.\n7. Open /technical to discuss exact raw accounting, display conversion and Token-2022 extension handling.\n\nIf an upstream read fails, keep the error visible and explain the bounded request behavior. Retry when appropriate; do not present another source of data as a successful live read. Never imply that the USDY mint contains Token-2022 extensions.\n\n${deck.slides.map((s,i)=>`## ${num(i+1)} — ${s.title.replaceAll('\n',' ')}\n\n${s.notes}\n`).join('\n')}\n## Questions and answers\n\n${deck.qa.map(q=>`### ${q.question}\n\n${q.answer}\n`).join('\n')}\n## Source map\n\nThe content is grounded in README.md, lib/rwa/balance.ts, lib/rwa/extensions.ts, lib/rwa/readiness.ts, lib/server/rwa/inspect.ts, lib/server/rwa/rpc.ts, lib/rwa/live-assets.json and checked-in verification receipts. Current verification counts belong to the release receipt rather than evergreen pitch slides.\n\n${references.map(([title,url])=>`- [${title}](${url})`).join('\n')}\n\nOfficial USDY and Solana sources reviewed on 23 September 2026. The commercial model and future team capabilities are proposals to validate. The deck makes no customer, revenue, adoption, backing or return claim.\n`;
writeFileSync(join(out, 'rwa-lens-presenter-notes.md'), notes);
copyFileSync(join(root, 'public/brand-kit/source/Inter-OFL.txt'), join(out, 'Inter-OFL.txt'));

// Native PowerPoint text and shapes remain editable; no slide is a screenshot.
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'RWA Lens';
pptx.subject = 'Solana token intelligence — partner pitch';
pptx.title = deck.title;
pptx.company = 'RWA Lens';
pptx.lang = 'en-US';
pptx.theme = { headFontFace: 'Inter', bodyFontFace: 'Inter', lang: 'en-US' };
// Slide height in inches; the deck uses the built-in LAYOUT_WIDE for its width.
const SH = 7.5;

/**
 * Place a source image inside a slide box, showing the region the deck wants.
 * Args are the box (x, y, w, h) then the fraction of the source to keep
 * (cropX, cropY, cropW, cropH). pptxgenjs expresses a crop in inches of the
 * image's own displayed size, so the fractions are scaled by the size the
 * source would occupy at the box's height.
 */
function imageSizingCrop(path, x, y, w, h, cropX, cropY, cropW, cropH) {
  const full = { w: w / cropW, h: h / cropH };
  return {
    x, y, w, h,
    sizing: { type: 'crop', x: full.w * cropX, y: full.h * cropY, w, h },
  };
}

const shape = pptx.ShapeType;
const tx = (slide, value, x, y, w, h, size, color, extra = {}) => slide.addText(value, { x, y, w, h, fontFace: 'Inter', fontSize: size, color, margin: 0, breakLine: false, valign: 'mid', ...extra });
for (const [i, content] of deck.slides.entries()) {
  const slide = pptx.addSlide();
  const dark = content.theme === 'dark';
  const bg = colours[content.theme === 'dark' ? 'ink' : content.theme];
  const ink = dark ? colours.ivory : colours.ink;
  const muted = dark ? 'B6BDB3' : content.theme === 'citron' ? '3C4F1F' : '50594D';
  const line = dark ? '353A34' : content.theme === 'citron' ? '94B33E' : 'C9CEC1';
  slide.background = { color: bg };
  const cover = ['cover', 'close'].includes(content.kind);
  if (cover) {
    slide.addImage({ path: join(root, 'public/brand/lens-master.png'), ...imageSizingCrop(join(root, 'public/brand/lens-master.png'), 5.8, 0, 7.53, SH, .4, 0, .6, 1) });
    slide.addShape(shape.rect, { x: 0, y: 0, w: 7.3, h: SH, fill: { color: bg }, line: { color: bg } });
  }
  slide.addShape(shape.ellipse, { x: .59, y: .4, w: .29, h: .29, fill: { color: bg, transparency: 100 }, line: { color: ink, width: 1.5 } });
  slide.addShape(shape.ellipse, { x: .66, y: .4, w: .14, h: .29, rotate: 38, fill: { color: bg, transparency: 100 }, line: { color: ink, width: 1.2 } });
  slide.addShape(shape.ellipse, { x: .83, y: .395, w: .06, h: .06, line: { color: dark ? colours.citron : colours.ink }, fill: { color: dark ? colours.citron : colours.ink } });
  tx(slide, 'RWA Lens', .98, .4, 2, .31, 18, ink, { bold: false, charSpacing: -.7 });
  tx(slide, deck.edition, 9.4, .4, 3.33, .31, 10, muted, { align: 'right' });
  const titleY = cover ? 2.05 : 1.58;
  tx(slide, content.section, .63, cover ? 1.54 : 1.12, 11.8, .26, 10, muted, { charSpacing: 2, bold: true });
  const titleLines = content.title.split('\n');
  const titleSize = cover ? 52 : 43;
  titleLines.forEach((text, n) => tx(slide, text, .58, titleY + n * (cover ? .71 : .58), cover ? 9.8 : 11.8, cover ? .75 : .62, titleSize, n && dark ? colours.citron : ink, { charSpacing: -2.3 }));
  const summaryY = titleY + titleLines.length * (cover ? .71 : .58) + .18;
  tx(slide, content.summary, .63, summaryY, cover ? 6.4 : 11.7, .46, 17, muted, { charSpacing: -.3 });
  if (content.items) {
    const top = 4.02, gap = .4, width = (12.073 - 2 * gap) / 3;
    content.items.forEach((item, n) => {
      const x = .63 + n * (width + gap);
      slide.addShape(shape.line, { x, y: top, w: width, h: 0, line: { color: line, width: 1 } });
      tx(slide, item.label, x, top + .22, width, .22, 10, muted, { charSpacing: 1.2, bold: true });
      if (['flow', 'architecture', 'equation'].includes(content.kind) && n < 2) tx(slide, '↗', x + width - .33, top + .13, .33, .4, 22, muted);
      tx(slide, item.title, x, top + .78, width, .37, 23, ink, { charSpacing: -.8 });
      tx(slide, item.body, x, top + 1.28, width - .03, .78, 16, muted, { valign: 'top', breakLine: false, paraSpaceAfter: 0, lineSpacingMultiple: 1.1 });
    });
  }
  if (content.note) tx(slide, content.note, .63, 6.34, 11.75, .3, 10.5, muted);
  if (cover) {
    const link = content.kind === 'cover' ? `${deck.url}/demo` : deck.url;
    tx(slide, content.kind === 'cover' ? 'Explore the live product ↗' : 'rwalensonsolana.vercel.app ↗', .63, 5.57, 6.7, .42, 17, ink, { hyperlink: { url: link } });
    tx(slide, content.kind === 'cover' ? 'READ-ONLY · MAINNET' : 'Technical breakdown ↗', .63, 6.17, 6.7, .3, 10.5, muted, content.kind === 'close' ? { hyperlink: { url: `${deck.url}/technical` } } : { charSpacing: 1.4 });
  }
  if (content.kind === 'demo') {
    slide.addShape(shape.roundRect, { x: 10.02, y: 6.18, w: 2.69, h: .5, radius: .18, rectRadius: .18, fill: { color: colours.citron }, line: { color: colours.citron } });
    tx(slide, 'Open live demo ↗', 10.19, 6.28, 2.38, .25, 12, colours.ink, { hyperlink: { url: `${deck.url}/demo` } });
  }
  slide.addShape(shape.line, { x: .63, y: 6.96, w: 12.07, h: 0, line: { color: line, width: .7 } });
  tx(slide, 'REAL ASSETS. CLEARER VISION.', .63, 7.08, 10, .15, 8, muted, { charSpacing: 1.4 });
  tx(slide, `${num(i + 1)} / ${num(deck.slides.length)}`, 11.57, 7.07, 1.13, .18, 9, muted, { align: 'right' });
  slide.addNotes(content.notes + '\n\nSources and Q&A: rwa-lens-presenter-notes.md.\n' + references.map(([title,url]) => title + ': ' + url).join('\n'));
}
await pptx.writeFile({ fileName: join(out, 'rwa-lens-pitch.pptx'), compression: true });

// The print edition uses the same offline HTML, not a separate content copy.
const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(out, 'rwa-lens-pitch.html')).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  await page.pdf({ path: join(out, 'rwa-lens-pitch.pdf'), printBackground: true, preferCSSPageSize: true, tagged: true });
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  await page.screenshot({ path: join(out, 'rwa-lens-pitch-preview.png') });
  const checks = [];
  for (const [width, height] of [[1920,1080],[1280,720],[768,1024],[375,667],[667,375]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflows = await page.evaluate(() => [...document.querySelectorAll('.slide')].flatMap(slide => {
      const parent = slide.getBoundingClientRect();
      const content = slide.querySelector('.slide-content');
      const footer = slide.querySelector('.slide-bottom').getBoundingClientRect();
      const header = slide.querySelector('.slide-top').getBoundingClientRect();
      return [...content.querySelectorAll('p,h1,h2,h3,.item-label,.action,.cover-links')].filter(el => getComputedStyle(el).display !== 'none').flatMap(el => {
        const r = el.getBoundingClientRect();
        return r.left < parent.left - 1 || r.right > parent.right + 1 || r.bottom > footer.top - 2 || r.top < header.bottom + 2 ? [{ slide: slide.id, text: el.textContent, bounds: { x: r.x, y: r.y, width: r.width, height: r.height }, footer: footer.top, header: header.bottom }] : [];
      });
    }));
    checks.push({ width, height, slides: deck.slides.length, overflows });
    if (width === 375 || width === 667) await page.screenshot({ path: join(docs, `pitch-${width}x${height}.png`) });
  }
  writeFileSync(join(docs, 'viewport-checks.json'), JSON.stringify(checks, null, 2) + '\n');
  if (checks.some(c => c.overflows.length)) throw new Error('Presentation viewport check failed; see docs/pitch/viewport-checks.json');
} finally { await browser.close(); }

const files = ['rwa-lens-pitch.html', 'rwa-lens-pitch.pdf', 'rwa-lens-pitch.pptx', 'rwa-lens-presenter-notes.md', 'rwa-lens-pitch-preview.png', 'Inter-OFL.txt'];
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ title: deck.title, edition: deck.edition, slideCount: deck.slides.length, files: files.map(name => ({ name, url: `/presentation/${name}`, bytes: statSync(join(out, name)).size, sha256: createHash('sha256').update(readFileSync(join(out, name))).digest('hex') })) }, null, 2) + '\n');
console.log(`Built ${deck.slides.length} slides: offline HTML, PDF, editable PPTX, notes. Viewport checks passed at five sizes.`);
