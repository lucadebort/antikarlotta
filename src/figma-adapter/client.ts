/**
 * Figma client — wraps the Figma REST API for component and variable reads.
 *
 * Uses GET /files/:key/components for published library components,
 * then groups them by containingComponentSet and fetches property
 * definitions from the node tree.
 */

import type {
  FigmaComponent,
  FigmaComponentSet,
  FigmaVariable,
  FigmaVariableCollection,
  FigmaAdapterConfig,
  FigmaComponentProperty,
} from "./types.js";

const FIGMA_API_BASE = "https://api.figma.com/v1";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function getToken(config: FigmaAdapterConfig): string {
  const token = config.accessToken ?? process.env.FIGMA_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "Figma access token not found. Set FIGMA_ACCESS_TOKEN env var or pass accessToken in config.",
    );
  }
  return token;
}

async function figmaFetch<T>(
  path: string,
  token: string,
): Promise<T> {
  const url = `${FIGMA_API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { "X-FIGMA-TOKEN": token },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Figma API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface FigmaPublishedComponent {
  key: string;
  file_key: string;
  node_id: string;
  name: string;
  description: string;
  containing_frame: {
    name: string;
    nodeId: string;
    pageId: string;
    pageName: string;
    containingComponentSet?: {
      name: string;
      nodeId: string;
    };
  };
}

interface FigmaFileComponentsResponse {
  meta: {
    components: FigmaPublishedComponent[];
  };
}

interface FigmaFileNodesResponse {
  nodes: Record<
    string,
    {
      document: {
        id: string;
        name: string;
        type: string;
        componentPropertyDefinitions?: Record<string, FigmaComponentProperty>;
        children?: Array<{
          id: string;
          name: string;
          type: string;
        }>;
      };
    }
  >;
}

interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, {
      id: string;
      name: string;
      key: string;
      resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR";
      description: string;
      valuesByMode: Record<string, unknown>;
      variableCollectionId: string;
    }>;
    variableCollections: Record<string, {
      id: string;
      name: string;
      key: string;
      modes: Array<{ modeId: string; name: string }>;
      variableIds: string[];
    }>;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all published components from a Figma file, grouped into component sets.
 *
 * Groups components by their containingComponentSet, then fetches property
 * definitions from the component set nodes.
 */
export async function fetchComponents(
  config: FigmaAdapterConfig,
): Promise<{ componentSets: FigmaComponentSet[]; components: FigmaComponent[] }> {
  const token = getToken(config);
  const { fileKey } = config;

  // Step 1: Get all published components
  const meta = await figmaFetch<FigmaFileComponentsResponse>(
    `/files/${fileKey}/components`,
    token,
  );

  const allComponents: FigmaComponent[] = meta.meta.components.map((c) => ({
    key: c.key,
    name: c.name,
    description: c.description,
    nodeId: c.node_id,
    componentSetId: c.containing_frame?.containingComponentSet?.nodeId,
  }));

  // Step 2: Group components by containingComponentSet
  const setMap = new Map<string, {
    name: string;
    nodeId: string;
    components: FigmaComponent[];
  }>();

  const standaloneComponents: FigmaComponent[] = [];

  for (const comp of allComponents) {
    const setInfo = meta.meta.components.find((c) => c.node_id === comp.nodeId)
      ?.containing_frame?.containingComponentSet;

    if (setInfo) {
      const existing = setMap.get(setInfo.nodeId);
      if (existing) {
        existing.components.push(comp);
      } else {
        setMap.set(setInfo.nodeId, {
          name: setInfo.name,
          nodeId: setInfo.nodeId,
          components: [comp],
        });
      }
    } else {
      standaloneComponents.push(comp);
    }
  }

  // Step 3: Fetch component set nodes to get property definitions
  const setNodeIds = [...setMap.keys()];
  const componentSets: FigmaComponentSet[] = [];

  for (let i = 0; i < setNodeIds.length; i += 50) {
    const batch = setNodeIds.slice(i, i + 50);
    const ids = batch.join(",");

    const nodesResponse = await figmaFetch<FigmaFileNodesResponse>(
      `/files/${fileKey}/nodes?ids=${ids}`,
      token,
    );

    for (const nodeId of batch) {
      const setInfo = setMap.get(nodeId);
      if (!setInfo) continue;

      const nodeData = nodesResponse.nodes[nodeId];
      const propDefs = nodeData?.document?.componentPropertyDefinitions ?? {};

      componentSets.push({
        key: nodeId,
        name: setInfo.name,
        description: "",
        nodeId: setInfo.nodeId,
        componentPropertyDefinitions: propDefs,
        variantComponents: setInfo.components,
      });
    }
  }

  return { componentSets, components: standaloneComponents };
}

/**
 * Fetch all variables and variable collections from a Figma file.
 */
export async function fetchVariables(
  config: FigmaAdapterConfig,
): Promise<{ variables: FigmaVariable[]; collections: FigmaVariableCollection[] }> {
  const token = getToken(config);
  const { fileKey } = config;

  const response = await figmaFetch<FigmaVariablesResponse>(
    `/files/${fileKey}/variables/local`,
    token,
  );

  const variables: FigmaVariable[] = Object.values(response.meta.variables).map((v) => ({
    id: v.id,
    name: v.name,
    key: v.key,
    resolvedType: v.resolvedType,
    description: v.description,
    valuesByMode: v.valuesByMode as Record<string, any>,
    variableCollectionId: v.variableCollectionId,
  }));

  const collections: FigmaVariableCollection[] = Object.values(
    response.meta.variableCollections,
  ).map((c) => ({
    id: c.id,
    name: c.name,
    key: c.key,
    modes: c.modes,
    variableIds: c.variableIds,
  }));

  return { variables, collections };
}
