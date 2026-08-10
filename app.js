const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = id => document.getElementById(id);

const TOOLS = [
  { id:'merge',    name:'Merge PDF',        emoji:'🧩', desc:'Combine multiple PDFs',        multi:true },
  { id:'split',     name:'Split PDF',        emoji:'✂️', desc:'Each page as its own file',     multi:false },
  { id:'remove',    name:'Remove Pages',     emoji:'🗑️', desc:"Delete pages you don't need",  multi:false },
  { id:'extract',   name:'Extract Pages',    emoji:'📑', desc:'Keep only selected pages',      multi:false },
  { id:'reorder',   name:'Reorder Pages',    emoji:'🔀', desc:'Drag pages into a new order',   multi:false },
  { id:'rotate',    name:'Rotate PDF',       emoji:'🔄', desc:'Rotate one or all pages',       multi:false },
  { id:'edit',      name:'Edit Text',        emoji:'📝', desc:'Change existing text on a page', multi:false },
  { id:'numbers',   name:'Add Page Numbers', emoji:'🔢', desc:'Stamp page numbers',            multi:false },
  { id:'text',      name:'Add Text',         emoji:'✏️', desc:'Click a page to add new text',  multi:false },
];

let state = {};

function resetState(){
  state = { tool:null, files:[], fileBytes:[], pdfDoc:null, pageOrder:[], removedSet:new Set(), keepSet:new Set(), rotationDelta:{}, texts:{}, edits:{}, fontEmbeds:{} };
}
resetState();

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
  $('backBtn').classList.toggle('show', id!=='screen-home');
}

// ---------- Home ----------
function buildHome(){
  const grid = $('toolGrid');
  grid.innerHTML='';
  TOOLS.forEach(t=>{
    const card = document.createElement('div');
    card.className='tool-card';
    card.innerHTML = `<div class="emoji">${t.emoji}</div><div class="name">${t.name}</div><div class="desc">${t.desc}</div>`;
    card.addEventListener('click', ()=> openTool(t.id));
    grid.appendChild(card);
  });
}
buildHome();

$('backBtn').addEventListener('click', ()=>{ resetState(); $('pageTitle').textContent='PDF Tools'; showScreen('screen-home'); });

function openTool(id){
  resetState();
  state.tool = TOOLS.find(t=>t.id===id);
  $('pageTitle').textContent = state.tool.name;
  $('fileInput').multiple = !!state.tool.multi;
  $('fileInput').value = '';
  $('dropzoneLabel').textContent = state.tool.multi ? 'Drop 2+ PDF files here, or click to choose' : 'Drop a PDF file here, or click to choose';
  $('uploadStatus').textContent = '';
  showScreen('screen-upload');
}

// ---------- Upload ----------
const dropzone = $('dropzone');
dropzone.addEventListener('click', ()=> $('fileInput').click());
['dragenter','dragover'].forEach(ev=> dropzone.addEventListener(ev, e=>{e.preventDefault(); dropzone.classList.add('drag');}));
['dragleave','drop'].forEach(ev=> dropzone.addEventListener(ev, e=>{e.preventDefault(); dropzone.classList.remove('drag');}));
dropzone.addEventListener('drop', e=> handleFiles([...e.dataTransfer.files].filter(f=>f.type==='application/pdf')));
$('fileInput').addEventListener('change', e=> handleFiles([...e.target.files]));

async function handleFiles(files){
  if (!files.length) return;
  if (!state.tool.multi) files = files.slice(0,1);
  state.files = files;
  $('uploadStatus').textContent = `Loading ${files.length} file(s)...`;
  try{
    if (state.tool.multi){
      state.fileBytes = await Promise.all(files.map(f=>f.arrayBuffer()));
    } else {
      const bytes = await files[0].arrayBuffer();
      state.pdfDoc = await PDFDocument.load(bytes);
      state.pageOrder = state.pdfDoc.getPages().map((_,i)=>i);
    }
    await enterWorkspace();
  } catch(err){
    $('uploadStatus').textContent = 'Could not read that PDF: ' + err.message;
  }
}

// ---------- Workspace ----------
async function enterWorkspace(){
  showScreen('screen-workspace');
  $('workspaceStatus').textContent = '';
  $('thumbs').innerHTML = '';
  $('fileList').classList.add('hidden');
  $('editorCanvasWrap').classList.add('hidden');
  $('processBtn').textContent = 'Process';
  const toolbar = $('workspaceToolbar');
  toolbar.innerHTML = '';

  if (state.tool.id === 'merge'){
    buildFileList();
    return;
  }

  await renderThumbs();

  if (state.tool.id === 'rotate'){
    const btn = document.createElement('button');
    btn.className='btn secondary small'; btn.textContent='Rotate all 90°';
    btn.onclick = ()=>{ state.pageOrder.forEach(i=> state.rotationDelta[i]=((state.rotationDelta[i]||0)+90)%360); renderThumbs(); };
    toolbar.appendChild(btn);
  }
  if (state.tool.id === 'text'){
    const hint = document.createElement('span');
    hint.className='status'; hint.textContent = 'Click a thumbnail to open it and add new text.';
    toolbar.appendChild(hint);
  }
  if (state.tool.id === 'edit'){
    const hint = document.createElement('span');
    hint.className='status'; hint.textContent = 'Click a thumbnail, then click existing text on the page to change it. The replacement is drawn in the closest matching standard font (weight/style detected automatically).';
    toolbar.appendChild(hint);
  }
  if (state.tool.id === 'remove' || state.tool.id === 'extract'){
    const hint = document.createElement('span');
    hint.className='status';
    hint.textContent = state.tool.id==='remove' ? 'Click pages to mark for removal.' : 'Click pages to select which to keep (all kept by default).';
    toolbar.appendChild(hint);
  }
}

// --- Merge: file list with drag reorder ---
function buildFileList(){
  const list = $('fileList');
  list.classList.remove('hidden');
  list.innerHTML = '';
  state.files.forEach((f,i)=>{
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.pos = i;
    li.innerHTML = `<span>${f.name}</span><span style="color:var(--muted);font-size:12px">drag to reorder</span>`;
    li.addEventListener('dragstart', ()=> li.classList.add('dragging'));
    li.addEventListener('dragend', ()=> li.classList.remove('dragging'));
    li.addEventListener('dragover', e=> e.preventDefault());
    li.addEventListener('drop', e=>{
      e.preventDefault();
      const dragEl = list.querySelector('.dragging');
      if (!dragEl) return;
      const from = parseInt(dragEl.dataset.pos);
      const to = i;
      if (from===to) return;
      const f2 = state.files.splice(from,1)[0]; state.files.splice(to,0,f2);
      const b2 = state.fileBytes.splice(from,1)[0]; state.fileBytes.splice(to,0,b2);
      buildFileList();
    });
    list.appendChild(li);
  });
}

// --- thumbnail grid for single-file tools ---
async function renderThumbs(){
  const wrap = $('thumbs');
  wrap.innerHTML = '';
  const bytes = await state.pdfDoc.save();
  const pjsDoc = await pdfjsLib.getDocument({data:bytes}).promise;

  if (state.tool.id === 'extract' && state.keepSet.size === 0){
    state.pageOrder.forEach(i=> state.keepSet.add(i)); // default: keep all until user deselects
  }

  for (let pos=0; pos<state.pageOrder.length; pos++){
    const origIdx = state.pageOrder[pos];
    const pjsPage = await pjsDoc.getPage(origIdx+1);
    const viewport = pjsPage.getViewport({scale:0.4});
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await pjsPage.render({canvasContext:canvas.getContext('2d'), viewport}).promise;

    const card = document.createElement('div');
    card.className = 'thumb';
    card.draggable = (state.tool.id==='reorder');
    card.dataset.pos = pos;
    if (state.tool.id==='remove' && state.removedSet.has(origIdx)) card.classList.add('removed');
    card.appendChild(canvas);
    const idxLbl = document.createElement('div');
    idxLbl.className='idx'; idxLbl.textContent = `Page ${pos+1}`;
    card.appendChild(idxLbl);

    if (state.tool.id==='remove'){
      const mark = document.createElement('div'); mark.className='mark';
      mark.textContent = state.removedSet.has(origIdx) ? '✕' : '';
      card.appendChild(mark);
      card.addEventListener('click', ()=>{
        if (state.removedSet.has(origIdx)) state.removedSet.delete(origIdx); else state.removedSet.add(origIdx);
        renderThumbs();
      });
    }
    if (state.tool.id==='extract'){
      const mark = document.createElement('div'); mark.className='mark';
      mark.textContent = state.keepSet.has(origIdx) ? '✓' : '';
      card.appendChild(mark);
      card.addEventListener('click', ()=>{
        if (state.keepSet.has(origIdx)) state.keepSet.delete(origIdx); else state.keepSet.add(origIdx);
        renderThumbs();
      });
    }
    if (state.tool.id==='rotate'){
      const actions = document.createElement('div'); actions.className='mini-actions';
      const rb = document.createElement('button'); rb.className='btn small secondary'; rb.textContent='⟳';
      rb.onclick=(e)=>{ e.stopPropagation(); state.rotationDelta[origIdx]=((state.rotationDelta[origIdx]||0)+90)%360; renderThumbs(); };
      actions.appendChild(rb); card.appendChild(actions);
    }
    if (state.tool.id==='text'){
      card.addEventListener('click', ()=> openTextEditor(pos));
    }
    if (state.tool.id==='edit'){
      card.addEventListener('click', ()=> openEditTextEditor(pos));
    }
    if (state.tool.id==='reorder'){
      card.addEventListener('dragstart', ()=> card.classList.add('dragging'));
      card.addEventListener('dragend', ()=> card.classList.remove('dragging'));
      card.addEventListener('dragover', e=> e.preventDefault());
      card.addEventListener('drop', e=>{
        e.preventDefault();
        const dragEl = wrap.querySelector('.dragging');
        if (!dragEl) return;
        const from = parseInt(dragEl.dataset.pos);
        const to = pos;
        if (from===to) return;
        const moved = state.pageOrder.splice(from,1)[0];
        state.pageOrder.splice(to,0,moved);
        renderThumbs();
      });
    }
    wrap.appendChild(card);
  }
}

// --- Font detection: map the PDF's actual font to the closest pdf-lib standard font ---
function classifyFont(pdfFontObj, fontNameId){
  const name = (pdfFontObj && pdfFontObj.name) ? pdfFontObj.name : (fontNameId || '');
  const lower = name.toLowerCase();
  const bold = !!(pdfFontObj && pdfFontObj.bold) || lower.includes('bold');
  const italic = !!(pdfFontObj && pdfFontObj.italic) || lower.includes('italic') || lower.includes('oblique');
  let family = 'helvetica';
  if (lower.includes('courier') || lower.includes('mono') || lower.includes('consol')) family = 'courier';
  else if (lower.includes('times') || lower.includes('serif') || lower.includes('georgia') || lower.includes('garamond') || lower.includes('cambria') || lower.includes('minion') || lower.includes('book')) family = 'times';
  return { family, bold, italic };
}

function standardFontKey({family, bold, italic}){
  if (family === 'courier'){
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (family === 'times'){
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

async function getEmbeddedFont(key){
  if (!state.fontEmbeds[key]) state.fontEmbeds[key] = await state.pdfDoc.embedFont(key);
  return state.fontEmbeds[key];
}

// --- Edit Text tool: click existing text runs and change them in place ---
async function openEditTextEditor(pos){
  const origIdx = state.pageOrder[pos];
  const bytes = await state.pdfDoc.save();
  const pjsDoc = await pdfjsLib.getDocument({data:bytes}).promise;
  const pjsPage = await pjsDoc.getPage(origIdx+1);
  const scale = 1.6;
  const viewport = pjsPage.getViewport({scale});
  const canvas = $('editorCanvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  await pjsPage.render({canvasContext:canvas.getContext('2d'), viewport}).promise;

  const layer = $('textLayer');
  layer.style.width = viewport.width+'px';
  layer.style.height = viewport.height+'px';
  layer.innerHTML = '';
  $('editorCanvasWrap').classList.remove('hidden');
  $('editorCanvasWrap').scrollIntoView({behavior:'smooth'});

  if (!state.edits[origIdx]) state.edits[origIdx] = [];
  const existingEdits = state.edits[origIdx];

  const content = await pjsPage.getTextContent();
  content.items.forEach((item, i)=>{
    if (!item.str || !item.str.trim()) return;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeightPx = Math.hypot(tx[2], tx[3]);
    const left = tx[4];
    const top = tx[5] - fontHeightPx;

    // resolve the PDF's actual font object for this run so we can match weight/style
    let pdfFontObj = null;
    try { pdfFontObj = pjsPage.commonObjs.get(item.fontName); } catch(e) { /* not resolved yet, fall back to id */ }
    const fontStyle = classifyFont(pdfFontObj, item.fontName);

    const span = document.createElement('span');
    span.contentEditable = 'true';
    span.textContent = item.str;
    span.style.left = left+'px';
    span.style.top = top+'px';
    span.style.fontSize = fontHeightPx+'px';
    span.style.lineHeight = fontHeightPx+'px';
    span.style.fontWeight = fontStyle.bold ? 'bold' : 'normal';
    span.style.fontStyle = fontStyle.italic ? 'italic' : 'normal';
    span.style.fontFamily = fontStyle.family === 'courier' ? 'monospace' : (fontStyle.family === 'times' ? 'serif' : 'sans-serif');

    // original position/size in PDF points, needed to bake the edit into the page later
    const pdfFontSize = Math.hypot(item.transform[0], item.transform[1]);
    const meta = { runId:i, origStr:item.str, pdfX:item.transform[4], pdfY:item.transform[5], pdfFontSize, pdfWidth: item.width, fontStyle };

    const already = existingEdits.find(e=> e.runId===i);
    if (already){ span.textContent = already.newStr; span.classList.add('edited'); }

    span.addEventListener('blur', ()=>{
      const val = span.textContent;
      const idxExisting = existingEdits.findIndex(e=> e.runId===i);
      if (val === item.str){
        if (idxExisting>-1) existingEdits.splice(idxExisting,1);
        span.classList.remove('edited');
      } else {
        span.classList.add('edited');
        const rec = { ...meta, newStr: val };
        if (idxExisting>-1) existingEdits[idxExisting] = rec; else existingEdits.push(rec);
      }
    });

    layer.appendChild(span);
  });
}

// --- Add Text tool: click-to-place on a single page ---
async function openTextEditor(pos){
  const origIdx = state.pageOrder[pos];
  const bytes = await state.pdfDoc.save();
  const pjsDoc = await pdfjsLib.getDocument({data:bytes}).promise;
  const pjsPage = await pjsDoc.getPage(origIdx+1);
  const scale = 1.4;
  const viewport = pjsPage.getViewport({scale});
  const canvas = $('editorCanvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  await pjsPage.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
  $('editorCanvasWrap').classList.remove('hidden');
  $('editorCanvasWrap').scrollIntoView({behavior:'smooth'});

  if (!state.texts[origIdx]) state.texts[origIdx] = [];
  const baseImage = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);

  function redraw(){
    const ctx = canvas.getContext('2d');
    ctx.putImageData(baseImage,0,0);
    state.texts[origIdx].forEach(t=>{
      ctx.fillStyle = '#e5322d'; ctx.font = '20px sans-serif';
      ctx.fillText(t.text, t.x, t.y);
    });
  }
  redraw();

  canvas.onclick = (e)=>{
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX-rect.left) * (canvas.width/rect.width);
    const y = (e.clientY-rect.top) * (canvas.height/rect.height);
    const text = prompt('Text to add:');
    if (!text) return;
    state.texts[origIdx].push({x,y,text,scale});
    redraw();
  };
}

// ---------- Process ----------
$('processBtn').addEventListener('click', async ()=>{
  if (state.tool.id === 'merge' && state.files.length < 2){
    $('workspaceStatus').textContent = 'Add at least 2 files to merge.';
    return;
  }
  $('workspaceStatus').textContent = 'Processing...';
  try{
    let outBytes, filename, mime='application/pdf';
    switch(state.tool.id){
      case 'merge': { outBytes = await doMerge(); filename='merged.pdf'; break; }
      case 'split': { outBytes = await doSplit(); filename='split-pages.zip'; mime='application/zip'; break; }
      case 'remove': { outBytes = await doKeepExcluding(state.removedSet); filename='removed-pages.pdf'; break; }
      case 'extract': { outBytes = await doKeepOnly(state.keepSet); filename='extracted-pages.pdf'; break; }
      case 'reorder': { outBytes = await doReorder(); filename='reordered.pdf'; break; }
      case 'rotate': { outBytes = await doRotate(); filename='rotated.pdf'; break; }
      case 'numbers': { outBytes = await doPageNumbers(); filename='numbered.pdf'; break; }
      case 'text': { outBytes = await doAddText(); filename='edited.pdf'; break; }
      case 'edit': { outBytes = await doEditText(); filename='edited.pdf'; break; }
    }
    showResult(outBytes, filename, mime);
  } catch(err){
    $('workspaceStatus').textContent = 'Error: ' + err.message;
  }
});

async function doMerge(){
  const out = await PDFDocument.create();
  for (const bytes of state.fileBytes){
    const src = await PDFDocument.load(bytes);
    const pages = await out.copyPages(src, src.getPages().map((_,i)=>i));
    pages.forEach(p=> out.addPage(p));
  }
  return out.save();
}

async function doSplit(){
  const zip = new JSZip();
  const total = state.pdfDoc.getPageCount();
  for (let i=0;i<total;i++){
    const single = await PDFDocument.create();
    const [p] = await single.copyPages(state.pdfDoc, [i]);
    single.addPage(p);
    const bytes = await single.save();
    zip.file(`page-${i+1}.pdf`, bytes);
  }
  return zip.generateAsync({type:'uint8array'});
}

async function copyOrderTo(order){
  const out = await PDFDocument.create();
  const pages = await out.copyPages(state.pdfDoc, order);
  pages.forEach(p=> out.addPage(p));
  return out.save();
}

async function doKeepExcluding(excludeSet){
  return copyOrderTo(state.pageOrder.filter(i=> !excludeSet.has(i)));
}
async function doKeepOnly(keepSet){
  return copyOrderTo(state.pageOrder.filter(i=> keepSet.has(i)));
}
async function doReorder(){
  return copyOrderTo(state.pageOrder);
}

async function doRotate(){
  state.pageOrder.forEach(origIdx=>{
    const delta = state.rotationDelta[origIdx]||0;
    if (!delta) return;
    const page = state.pdfDoc.getPage(origIdx);
    page.setRotation(degrees((page.getRotation().angle + delta) % 360));
  });
  return copyOrderTo(state.pageOrder);
}

async function doPageNumbers(){
  state.pageOrder.forEach((origIdx,i)=>{
    const page = state.pdfDoc.getPage(origIdx);
    const { width } = page.getSize();
    page.drawText(String(i+1), { x: width/2 - 4, y: 20, size: 12, color: rgb(0,0,0) });
  });
  return copyOrderTo(state.pageOrder);
}

async function doAddText(){
  Object.entries(state.texts).forEach(([origIdx, items])=>{
    const page = state.pdfDoc.getPage(parseInt(origIdx));
    const pageHeight = page.getHeight();
    items.forEach(t=>{
      page.drawText(t.text, { x: t.x/t.scale, y: pageHeight - t.y/t.scale, size: 14, color: rgb(0.9,0.2,0.18) });
    });
  });
  return copyOrderTo(state.pageOrder);
}

async function doEditText(){
  for (const [origIdx, runs] of Object.entries(state.edits)){
    if (!runs.length) continue;
    const page = state.pdfDoc.getPage(parseInt(origIdx));
    for (const r of runs){
      const font = await getEmbeddedFont(standardFontKey(r.fontStyle || {family:'helvetica', bold:false, italic:false}));
      const padding = r.pdfFontSize*0.15;
      page.drawRectangle({
        x: r.pdfX - padding,
        y: r.pdfY - padding,
        width: r.pdfWidth + padding*2,
        height: r.pdfFontSize + padding*2,
        color: rgb(1,1,1)
      });
      page.drawText(r.newStr, { x: r.pdfX, y: r.pdfY, size: r.pdfFontSize, font, color: rgb(0,0,0) });
    }
  }
  return copyOrderTo(state.pageOrder);
}

// ---------- Result ----------
function showResult(bytes, filename, mime){
  const blob = new Blob([bytes], {type:mime});
  const url = URL.createObjectURL(blob);
  $('resultText').textContent = `Your file is ready: ${filename}`;
  const dl = $('downloadBtn');
  dl.onclick = ()=>{
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  };
  showScreen('screen-result');
}

$('startOverBtn').addEventListener('click', ()=>{ resetState(); $('pageTitle').textContent='PDF Tools'; showScreen('screen-home'); });
