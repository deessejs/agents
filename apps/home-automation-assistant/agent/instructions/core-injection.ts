import { defineDynamic, defineInstructions } from "eve/instructions";
import { readCoreMemory } from "@ds-team/database/queries";

export default defineDynamic({
  events: {
    "session.started": async (_event, _ctx) => {
      const core = await readCoreMemory({ viewerId: "home-automation-assistant" });
      if (!core) return null;
      return defineInstructions({
        markdown: `## Long-term memory\n\n${core}\n`,
      });
    },
  },
});
