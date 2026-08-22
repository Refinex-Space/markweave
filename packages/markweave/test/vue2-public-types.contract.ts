import type Vue from "../../markweave-vue2/node_modules/vue";
import type { VueConstructor } from "../../markweave-vue2/node_modules/vue";
import {
  MarkweaveEditor,
  type MarkweaveVue2EditorProps,
} from "../../markweave-vue2/src";

const publicComponent: VueConstructor<Vue> = MarkweaveEditor;
const publicInstance = new MarkweaveEditor();
const publicProps: MarkweaveVue2EditorProps = {
  defaultContent: "# Typed Vue 2 consumer",
  onUpdate(payload) {
    void payload.markdown;
  },
};
const publicDefaultContent = publicInstance.defaultContent;

export { publicComponent, publicDefaultContent, publicProps };
