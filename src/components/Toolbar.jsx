function Btn({ editor, title, active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active ? 'true' : 'false'}
      className={`tb-btn ${active ? 'active' : ''}`}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      disabled={disabled || !editor}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="tb-sep" />;

export default function Toolbar({ editor, onImport }) {
  if (!editor) return <div className="toolbar" />;
  const chain = () => editor.chain().focus();

  const blockValue = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
      : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p';

  function setBlock(v) {
    if (v === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(v[1]) }).run();
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn editor={editor} title="Undo (⌘Z)" onClick={() => chain().undo().run()} disabled={!editor.can().undo()}>↶</Btn>
      <Btn editor={editor} title="Redo (⌘⇧Z)" onClick={() => chain().redo().run()} disabled={!editor.can().redo()}>↷</Btn>
      <Sep />
      <select className="tb-select" value={blockValue} onChange={(e) => setBlock(e.target.value)} aria-label="Text style">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn editor={editor} title="Bold (⌘B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
      <Btn editor={editor} title="Italic (⌘I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
      <Btn editor={editor} title="Underline (⌘U)" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
      <Btn editor={editor} title="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
      <Sep />
      <Btn editor={editor} title="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>•≡</Btn>
      <Btn editor={editor} title="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>1≡</Btn>
      <Btn editor={editor} title="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>❝</Btn>
      <Btn editor={editor} title="Code block" active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}>{'</>'}</Btn>
      <Sep />
      <Btn editor={editor} title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()}>⇤</Btn>
      <Btn editor={editor} title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()}>↔</Btn>
      <Btn editor={editor} title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()}>⇥</Btn>
      <Btn editor={editor} title="Divider" onClick={() => chain().setHorizontalRule().run()}>―</Btn>
      <Btn editor={editor} title="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>⌫</Btn>
      {onImport && (
        <>
          <Sep />
          <button type="button" className="tb-btn tb-text" title="Insert a .txt, .md or .docx file at the cursor" onClick={onImport}>
            ⇪ Insert file
          </button>
        </>
      )}
    </div>
  );
}
