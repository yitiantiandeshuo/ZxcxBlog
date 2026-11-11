export const editorToolsSource = `function applyMarkdownTool(textarea, action) {
  const start=textarea.selectionStart, end=textarea.selectionEnd, selected=textarea.value.slice(start,end);
  const templates={heading:['## ','标题',''],bold:['**','文字','**'],italic:['*','文字','*'],link:['[','链接文字','](https://)'],code:['\u0060','代码','\u0060'],codeblock:['\\n\u0060\u0060\u0060\\n','代码','\\n\u0060\u0060\u0060\\n'],task:['- [ ] ','任务',''],list:['- ','项目',''],table:['','| 项目 | 内容 |\\n| --- | --- |\\n| 示例 | 内容 |','']};
  const parts=templates[action];if(!parts)return false;
  const text=selected || parts[1], replacement=parts[0]+text+parts[2];
  textarea.setRangeText(replacement,start,end,'end');textarea.focus();textarea.setSelectionRange(start+parts[0].length,start+parts[0].length+text.length);textarea.dispatchEvent(new Event('input',{bubbles:true}));return true;
}`;
