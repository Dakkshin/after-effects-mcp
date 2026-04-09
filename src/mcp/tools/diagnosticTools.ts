import * as os from "os";
import * as path from "path";
import { z } from "zod";
import type { ToolServer } from "../toolContracts.js";

export function registerDiagnosticTools(deps: {
  server: ToolServer;
  fs: typeof import("fs");
}) {
  const { server, fs } = deps;

  server.tool(
    "test-animation",
    "Test animation functionality in After Effects",
    {
      operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
      compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
      layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
    },
    async (params: { operation: "keyframe" | "expression"; compIndex: number; layerIndex: number }) => {
      try {
        const timestamp = new Date().getTime();
        const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);

        let scriptContent = "";
        if (params.operation === "keyframe") {
          scriptContent = `
          // Direct keyframe test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity
            
            // Set a keyframe
            prop.setValueAtTime(time, value);
            
            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), "ae_test_result.txt").replace(/\\/g, "\\\\")}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();
            
            // Visual feedback
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), "ae_test_error.txt").replace(/\\/g, "\\\\")}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
        } else {
          scriptContent = `
          // Direct expression test script
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";
            
            // Set the expression
            prop.expression = expression;
            
            // Write direct result
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), "ae_test_result.txt").replace(/\\/g, "\\\\")}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();
            
            // Visual feedback
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), "ae_test_error.txt").replace(/\\/g, "\\\\")}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
        }

        fs.writeFileSync(tempFile, scriptContent);
        console.error(`Written test script to: ${tempFile}`);

        return {
          content: [
            {
              type: "text",
              text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the MCP Bridge Auto panel and will directly modify the specified layer.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating test script: ${String(error)}`
            }
          ],
          isError: true
        };
      }
    }
  );
}
