/*!
 * @authormark v1 -- do not remove (authorship watermark)
 * Copyright (c) 2026 Srinivasan Vijayaraghavan <srinivasan.shyam2000@gmail.com>
 * Author: https://github.com/Srinivasan-78
 * SPDX-License-Identifier: MIT
 * Fingerprint: AMK1.FtnRXjFGJXQNsyFH8wCNsX
 */
let PDFDocument, degrees, rgb, StandardFonts;
function initLibraries() {
  if (typeof PDFLib !== 'undefined' && !PDFDocument) {
    ({ PDFDocument, degrees, rgb, StandardFonts } = PDFLib);
  }
  if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
}
initLibraries();

// URL of the FastAPI + PyMuPDF backend (see /backend). Required only for the
// "Edit Text" tool, which needs real font extraction/content-stream editing
// that isn't feasible purely client-side. Leave empty to disable that tool.
const BACKEND_URL = ""; // e.g. "https://your-backend.example.com"

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
  state = { tool:null, files:[], fileBytes:[], pdfDoc:null, pageOrder:[], removedSet:new Set(), keepSet:new Set(), rotationDelta:{}, texts:{}, edits:{} };
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
    const isEditDisabled = (t.id === 'edit' && !BACKEND_URL);
    card.className = 'tool-card' + (isEditDisabled ? ' disabled' : '');
    card.innerHTML = `<div class="emoji">${t.emoji}</div><div class="name">${t.name}</div><div class="desc">${isEditDisabled ? 'Requires backend configured' : t.desc}</div>`;
    if (isEditDisabled) {
      card.title = 'Edit Text needs a backend configured (BACKEND_URL in app.js)';
      card.style.opacity = '0.5';
      card.style.cursor = 'not-allowed';
    } else {
      card.addEventListener('click', ()=> openTool(t.id));
    }
    grid.appendChild(card);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initLibraries();
    buildHome();
  });
} else {
  initLibraries();
  buildHome();
}

$('backBtn').addEventListener('click', ()=>{ resetState(); $('pageTitle').textContent='PDF Tools'; showScreen('screen-home'); });

function openTool(id){
  if (id === 'edit' && !BACKEND_URL) return;
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
  initLibraries();
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
    hint.className='status';
    hint.textContent = BACKEND_URL
      ? 'Click a thumbnail, then click existing text on the page to change it. Replacements reuse the PDF\'s real font where possible.'
      : 'Edit Text needs a backend configured (BACKEND_URL in app.js) — see /backend.';
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
    // textContent, not innerHTML: a filename is attacker-controlled input.
    // A file named `<img src=x onerror=...>.pdf` would otherwise run as script
    // in this page, which is exactly the thing "your file never leaves the
    // browser" is supposed to rule out.
    const nameEl = document.createElement('span');
    nameEl.textContent = f.name;
    const hintEl = document.createElement('span');
    hintEl.style.color = 'var(--muted)';
    hintEl.style.fontSize = '12px';
    hintEl.textContent = 'drag to reorder';
    li.append(nameEl, hintEl);
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

// --- Shared helper to render a PDF page onto a canvas ---
async function renderPageToCanvas(pageIndex, canvas, scale = 1.6){
  const bytes = await state.pdfDoc.save();
  const pjsDoc = await pdfjsLib.getDocument({data:bytes}).promise;
  const pjsPage = await pjsDoc.getPage(pageIndex + 1);
  const viewport = pjsPage.getViewport({scale});
  canvas.width = viewport.width; canvas.height = viewport.height;
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  await pjsPage.render({canvasContext:canvas.getContext('2d'), viewport}).promise;
  return viewport;
}

// --- Edit Text tool: click existing text runs (from the backend) and change them in place ---
async function openEditTextEditor(pos){
  if (!BACKEND_URL){
    $('workspaceStatus').textContent = 'Edit Text needs a backend configured (BACKEND_URL in app.js).';
    return;
  }
  const origIdx = state.pageOrder[pos];

  // render the visual canvas locally (fast, no round trip)
  const canvas = $('editorCanvas');
  const viewport = await renderPageToCanvas(origIdx, canvas, 1.6);

  const layer = $('textLayer');
  layer.style.width = viewport.width+'px';
  layer.style.height = viewport.height+'px';
  layer.innerHTML = '';
  $('editorCanvasWrap').classList.remove('hidden');
  $('editorCanvasWrap').scrollIntoView({behavior:'smooth'});

  // fetch the real text spans (position/font/size/color) from the backend
  $('workspaceStatus').textContent = 'Reading page text...';
  const form = new FormData();
  form.append('file', state.files[0]);
  form.append('page', origIdx);
  let inspectResult;
  try{
    const res = await fetch(`${BACKEND_URL}/api/inspect`, { method:'POST', body: form });
    if (!res.ok) throw new Error(`backend returned ${res.status}`);
    inspectResult = await res.json();
  } catch(err){
    $('workspaceStatus').textContent = 'Could not reach backend: ' + err.message;
    return;
  }
  $('workspaceStatus').textContent = '';

  const pxPerPt = viewport.width / inspectResult.width; // == pdf.js scale, unless the page is rotated
  if (!state.edits[origIdx]) state.edits[origIdx] = {};
  const existingEdits = state.edits[origIdx];

  inspectResult.spans.forEach(span=>{
    const [x0,y0,x1,y1] = span.bbox;
    const span_el = document.createElement('span');
    span_el.contentEditable = 'true';
    const already = existingEdits[span.id];
    span_el.textContent = already ? already.newText : span.text;
    if (already) span_el.classList.add('edited');
    span_el.style.left = (x0*pxPerPt)+'px';
    span_el.style.top = (y0*pxPerPt)+'px';
    span_el.style.width = ((x1-x0)*pxPerPt)+'px';
    span_el.style.height = ((y1-y0)*pxPerPt)+'px';
    span_el.style.fontSize = (span.size*pxPerPt)+'px';
    span_el.style.lineHeight = ((y1-y0)*pxPerPt)+'px';

    span_el.addEventListener('blur', ()=>{
      const val = span_el.textContent;
      if (val === span.text){
        delete existingEdits[span.id];
        span_el.classList.remove('edited');
      } else {
        span_el.classList.add('edited');
        existingEdits[span.id] = {
          page: origIdx, bbox: span.bbox, newText: val,
          font: span.font, size: span.size, color: span.color, flags: span.flags
        };
      }
    });

    layer.appendChild(span_el);
  });
}


// --- Add Text tool: click-to-place on a single page ---
async function openTextEditor(pos){
  const origIdx = state.pageOrder[pos];
  const scale = 1.4;
  const canvas = $('editorCanvas');
  await renderPageToCanvas(origIdx, canvas, scale);
  $('editorCanvasWrap').classList.remove('hidden');
  $('editorCanvasWrap').scrollIntoView({behavior:'smooth'});

  if (!state.texts[origIdx]) state.texts[origIdx] = [];
  const baseImage = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);

  function redraw(){
    const ctx = canvas.getContext('2d');
    ctx.putImageData(baseImage,0,0);
    state.texts[origIdx].forEach(t=>{
      ctx.fillStyle = '#000000'; ctx.font = '20px sans-serif';
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
      case 'edit': {
        if (!BACKEND_URL) {
          $('workspaceStatus').textContent = 'Edit Text needs a backend configured (BACKEND_URL in app.js).';
          return;
        }
        outBytes = await doEditText();
        filename='edited.pdf';
        break;
      }
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
      page.drawText(t.text, { x: t.x/t.scale, y: pageHeight - t.y/t.scale, size: 14, color: rgb(0,0,0) });
    });
  });
  return copyOrderTo(state.pageOrder);
}

async function doEditText(){
  const flatEdits = [];
  Object.values(state.edits).forEach(pageEdits=>{
    Object.values(pageEdits).forEach(e=> flatEdits.push(e));
  });
  if (!flatEdits.length) throw new Error('No text was changed.');

  const form = new FormData();
  form.append('file', state.files[0]);
  form.append('edits', JSON.stringify(flatEdits));
  const res = await fetch(`${BACKEND_URL}/api/apply-edits`, { method:'POST', body: form });
  if (!res.ok) throw new Error(`backend returned ${res.status}`);
  const blob = await res.blob();
  return new Uint8Array(await blob.arrayBuffer());
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
