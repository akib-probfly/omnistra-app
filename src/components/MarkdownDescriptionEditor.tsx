import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function markdownToHtml(markdown: string) {
  const inline = (line: string) => escapeHtml(line)
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)]+)\)/gi, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>');
  const blocks: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => { if (list) blocks.push(`</${list}>`); list = null; };
  for (const line of markdown.split(/\r?\n/)) {
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const nextList = unordered ? 'ul' : 'ol';
      if (list !== nextList) { closeList(); blocks.push(`<${nextList}>`); list = nextList; }
      blocks.push(`<li>${inline((unordered ?? ordered)![1])}</li>`);
    } else {
      closeList();
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      else if (line.trim()) blocks.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return blocks.join('') || '<p><br></p>';
}

const EDITOR_SCRIPT = `
const root=document.getElementById('editor');
function markdown(node){
  if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const tag=node.tagName.toLowerCase();
  const content=Array.from(node.childNodes).map(markdown).join('');
  if(tag==='strong'||tag==='b')return '**'+content+'**';
  if(tag==='em'||tag==='i')return '*'+content+'*';
  if(tag==='a')return '['+content+']('+node.getAttribute('href')+')';
  if(tag==='br')return '\\n';
  if(tag==='li')return content;
  if(tag==='ul')return Array.from(node.children).map((item)=>'- '+markdown(item)).join('\\n')+'\\n\\n';
  if(tag==='ol')return Array.from(node.children).map((item,index)=>(index+1)+'. '+markdown(item)).join('\\n')+'\\n\\n';
  if(/^h[1-3]$/.test(tag))return '#'.repeat(Number(tag[1]))+' '+content+'\\n\\n';
  if(tag==='p'||tag==='div')return content+'\\n\\n';
  return content;
}
function send(){window.ReactNativeWebView.postMessage(markdown(root).replace(/\\n{3,}/g,'\\n\\n').trim());}
function active(){document.querySelectorAll('[data-command]').forEach((button)=>button.classList.toggle('active',document.queryCommandState(button.dataset.command)));const node=window.getSelection()?.anchorNode?.parentElement;document.querySelector('[data-heading]').classList.toggle('active',!!node?.closest('h2'));}
document.querySelectorAll('button').forEach((button)=>button.addEventListener('mousedown',(event)=>event.preventDefault()));
document.querySelectorAll('[data-command]').forEach((button)=>button.addEventListener('click',()=>{root.focus();document.execCommand(button.dataset.command,false,null);active();send();}));
document.querySelector('[data-heading]').addEventListener('click',()=>{root.focus();document.execCommand('formatBlock',false,'H2');active();send();});
document.querySelector('[data-link]').addEventListener('click',()=>{root.focus();let url=prompt('Enter link URL');if(url){if(!/^(https?:|mailto:)/i.test(url))url='https://'+url;document.execCommand('createLink',false,url);active();send();}});
root.addEventListener('input',send);document.addEventListener('selectionchange',active);root.addEventListener('keyup',active);root.addEventListener('mouseup',active);
`;

export function MarkdownDescriptionEditor({ value, onChange }: { value: string; onChange: (markdown: string) => void }) {
  const { colors } = useTheme();
  const webView = useRef<WebView>(null);
  const lastSentValue = useRef(value);
  const source = useMemo(() => ({ html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;padding:0;background:${colors.surface};color:${colors.text};font:15px -apple-system,BlinkMacSystemFont,sans-serif}#toolbar{display:flex;align-items:center;gap:5px;padding:9px 11px;background:${colors.surfaceSecondary};border-bottom:1px solid ${colors.cardBorder}}.tool-mark{display:flex;align-items:center;justify-content:center;width:30px;height:30px;margin-right:3px;border-radius:9px;background:${colors.primarySoft};color:${colors.primary};font-size:14px;font-weight:800}button{display:flex;align-items:center;justify-content:center;height:34px;min-width:34px;padding:0 8px;border:1px solid transparent;border-radius:9px;background:transparent;color:${colors.textSecondary};font-size:14px;font-weight:600}button.active{border-color:${colors.primaryBorder};background:${colors.primarySoft};color:${colors.primary}}button:active{background:${colors.surface}}.divider{height:20px;width:1px;margin:0 2px;background:${colors.cardBorder}}#editor{min-height:158px;padding:15px 16px;outline:none;line-height:1.6;overflow-wrap:anywhere}#editor:empty:before{content:'Describe this product';color:${colors.textMuted}}#editor p{margin:0 0 9px}#editor h1,#editor h2,#editor h3{font-size:1.18em;font-weight:700;margin:0 0 9px}#editor ul,#editor ol{padding-left:24px;margin:0 0 9px}a{color:${colors.primary}}
    </style></head><body><div id="toolbar"><span class="tool-mark">Aa</span><button data-command="bold" aria-label="Bold" title="Bold"><b>B</b></button><button data-command="italic" aria-label="Italic" title="Italic"><i>I</i></button><button data-heading aria-label="Heading" title="Heading">H2</button><span class="divider"></span><button data-command="insertUnorderedList" aria-label="Bulleted list" title="Bulleted list">•</button><button data-command="insertOrderedList" aria-label="Numbered list" title="Numbered list">1.</button><span class="divider"></span><button data-link aria-label="Link" title="Insert link">↗</button></div><div id="editor" contenteditable="true" spellcheck="true">${markdownToHtml(value)}</div><script>${EDITOR_SCRIPT}</script></body></html>` }), [colors]);

  useEffect(() => {
    if (value === lastSentValue.current) return;
    lastSentValue.current = value;
    const html = JSON.stringify(markdownToHtml(value));
    webView.current?.injectJavaScript(`document.getElementById('editor').innerHTML=${html};true;`);
  }, [value]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const markdown = event.nativeEvent.data;
    lastSentValue.current = markdown;
    onChange(markdown);
  };

  return <View style={[styles.container, { borderColor: colors.inputBorder, backgroundColor: colors.surface }]}><WebView ref={webView} source={source} onMessage={handleMessage} originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} nestedScrollEnabled={false} keyboardDisplayRequiresUserAction={false} setSupportMultipleWindows={false} style={styles.webView} /></View>;
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, borderWidth: 1, elevation: 1, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 5 },
  webView: { backgroundColor: 'transparent', height: 212 },
});
