export const initialPlaygroundDocument = `
<h1>Markweave Editor Playground</h1>
<p>Start here: the playground opens inside the table body cell so table handles, cell focus state, and keyboard traversal are immediately active.</p>
<table>
  <tbody>
    <tr>
      <th><p>Module</p></th>
      <th><p>Interaction target</p></th>
      <th><p>Status</p></th>
    </tr>
    <tr>
      <td><p>Table</p></td>
      <td><p>Navigation, paste, merge, split</p></td>
      <td><p>Modeled</p></td>
    </tr>
    <tr>
      <td><p>Selection</p></td>
      <td><p>Toolbar and cursor state</p></td>
      <td><p>Modeled</p></td>
    </tr>
  </tbody>
</table>
<h2>Markdown WYSIWYG</h2>
<p>Type <code># </code>, <code>&gt; </code>, <code>- </code>, <code>1. </code>, <code>**bold**</code>, or <code>\`inline code\`</code> to exercise input rules. Type <code>/table</code> in a fresh paragraph and execute it to insert a structured table with focus restored into the first body cell.</p>
<blockquote>
  <p>The demo keeps editor behavior close to the package entrypoint instead of a separate app shell.</p>
</blockquote>
<ul>
  <li><p>Select text to open the floating toolbar.</p></li>
  <li><p>Type <code>/</code> at the start of a paragraph to inspect slash state.</p></li>
</ul>
<h2>Code Block</h2>
<pre><code class="language-ts">export function sample() {
  return "markweave-editor";
}</code></pre>
<h2>Mermaid Fence</h2>
<pre><code class="language-mermaid">graph TD
  A[Markdown] --> B[Editor Core]
  B --> C[Playground]</code></pre>
`;

export const mergedTablePlaygroundDocument = `
<h1>Table Merge Fixture</h1>
<p>Table sample with merged headers, row-spanned body cells, and clipboard targets.</p>
<table>
  <tbody>
    <tr>
      <th colspan="2"><p>Merged Header</p></th>
      <th><p>Solo</p></th>
    </tr>
    <tr>
      <td rowspan="2"><p>A</p></td>
      <td><p>B</p></td>
      <td><p>C</p></td>
    </tr>
    <tr>
      <td><p>D</p></td>
      <td><p>E</p></td>
    </tr>
  </tbody>
</table>
<p>Visual-axis anchors include B, D, and E across mixed colspan and rowspan coverage.</p>
<h2>Clipboard Targets</h2>
<p>Rows and columns cover merged header, row-spanned body, and ordinary cells.</p>
`;
