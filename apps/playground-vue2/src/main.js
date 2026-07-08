import Vue from "vue";
import { MarkweaveEditorPlayground } from "./MarkweaveEditorPlayground";
import "markweave/styles.css";
import "./styles.css";

Vue.config.productionTip = false;

new Vue({
  render: (h) => h(MarkweaveEditorPlayground),
}).$mount("#app");
