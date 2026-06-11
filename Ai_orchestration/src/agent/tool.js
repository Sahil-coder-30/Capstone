import axios from "axios";
import { tool } from "@langchain/core/tools";
import * as z from "zod";

function formatError(err) {
  try {
    const isAxios = axios.isAxiosError && axios.isAxiosError(err);
    if (isAxios) {
      return {
        message: err.message,
        code: err.code || null,
        stack: err.stack || null,
        config: err.config || null,
        response: err.response
          ? {
              status: err.response.status,
              statusText: err.response.statusText,
              data: err.response.data,
              headers: err.response.headers,
            }
          : null,
      };
    }

    return {
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : null,
    };
  } catch (e) {
    return {
      message: "Unknown error while formatting error",
      details: String(e),
    };
  }
}

function logError(toolName, err) {
  const formatted = formatError(err);
  console.error("============================");
  console.error(`Error in ${toolName}:`, formatted);
  console.error("============================");
  return formatted;
}


export const listFiles = tool(
  async ({}, config) => {
    try {
      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/list-files`,{ timeout: 120000 }
      );
      console.log("============================");
      console.log("Using the listFiles tool");
      console.log(response.data);
      console.log("============================");

      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("listFiles", err);
      return JSON.stringify({
        error: true,
        message: "Failed to list files",
        details: formatted,
      });
    }
  },
  {
    name: "list_files",
    description:
      "List all files in the working directory of the project and return the file names as a list of strings.",
    schema: z.object({}),
  },
);

export const readFile = tool(
  async ({ file },config) => {
    try {
      const response = await axios.get(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/read-file?files=` +
          file.join(","),{ timeout: 120000 }
      );

      console.log("============================");
      console.log("Using the readFiles tool");
      console.log(response.data);
      console.log("============================");

      return JSON.stringify(response.data.content);
    } catch (err) {
      const formatted = logError("readFile", err);
      return JSON.stringify({
        error: true,
        message: "Failed to read file(s)",
        details: formatted,
      });
    }
  },
  {
    name: "read_file",
    description:
      'Read the content of a file in the working directory of the project and return it as a string, can read multiple files at once, just pass the file names as a list of strings. If the file is in a subdirectory, include the relative path from the working directory. For example, if the file is located at "src/utils/helper.js", the fileName should be "src/utils/helper.js".',
    schema: z.object({
      file: z
        .array(z.string())
        .describe(
          "List of file names to read, can include relative paths for files in subdirectories",
        ),
    }),
  },
);

export const updateFile = tool(
  async ({ updates },config) => {
    try {
      const response = await axios.patch(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/update-file`,
        {
          updates,
        },{ timeout: 120000 }
      );
      console.log("============================");
      console.log("Using the updateFile tool");
      console.log(response.data);
      console.log("============================");

      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("updateFile", err);
      return JSON.stringify({
        error: true,
        message: "Failed to update file(s)",
        details: formatted,
      });
    }
  },
  {
    name: "update_file",
    description:
      "Use to update the content of files. Multiple files can also be updated at the same time.",
    schema: z.object({
      updates: z
        .array(
          z.object({
            file: z
              .string()
              .describe(
                'The name of the file to update. If the file is in a subdirectory, include the relative path from the working directory. For example, if the file is located at "src/utils/helper.js", the file name should be "src/utils/helper.js".',
              ),
            content: z
              .string()
              .describe("The new content to write to the file."),
          }),
        )
        .describe("List of files to update with their new content"),
    }),
  },
);

export const createFile = tool(
  async ({ files } , config) => {
    try {
      const response = await axios.post(
        `http://sandbox-service-${config.configurable.projectId}:3000/api/agent/create-file`,
        {
          files,
        },{ timeout: 120000 }
      );
      console.log("============================");
      console.log("Using the createFile tool");
      console.log(response.data);
      console.log("============================");

      return JSON.stringify(response.data);
    } catch (err) {
      const formatted = logError("createFile", err);
      return JSON.stringify({
        error: true,
        message: "Failed to create file(s)",
        details: formatted,
      });
    }
  },
  {
    name: "create_file",
    description:
      'Create one or more new files in the workspace. All intermediate parent directories are created automatically at any nesting depth — you do NOT need to create directories manually before creating a file inside them. For example, creating "src/components/ui/Button.jsx" will automatically create "src/", "src/components/", and "src/components/ui/" if they don\'t exist. If the file already exists, its content will be overwritten. Send a JSON body with a "files" array — each item must have a "file" (relative path) and "content" (file content as a string) property. Always prefer batching multiple file creations into a single call.',
    schema: z.object({
      files: z
        .array(
          z.object({
            file: z
              .string()
              .describe(
                'Relative path of the file to create (e.g. "src/components/Header.jsx"). Supports any nesting level. Do NOT include a leading slash.',
              ),
            content: z
              .string()
              .describe(
                'Full content to write to the file. Empty string "" is valid.',
              ),
          }),
        )
        .describe(
          "Array of { file: string, content: string } objects representing the files to create",
        ),
    }),
  },
);
