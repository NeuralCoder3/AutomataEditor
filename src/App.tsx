// react
import * as React from 'react';
import { ChangeEvent } from 'react';

// algorithms, background
import pbkdf2 from 'pbkdf2';
import lzbase62 from 'lzbase62';
import axios from 'axios';
import createPersistedState from 'use-persisted-state';
import downloadjs from 'downloadjs';

// components
import * as go from 'gojs';
import { ReactDiagram } from 'gojs-react';
import Popup from 'reactjs-popup';

// visual
import 'reactjs-popup/dist/index.css';
import Highlight from 'react-highlight';
import CodeBlock from 'react-copy-code';

// material ui, icons
import { Icon } from '@iconify/react';
import Button from '@mui/material/Button';
import FeedbackIcon from '@mui/icons-material/Feedback';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import TextField from '@mui/material/TextField';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import MenuIcon from '@mui/icons-material/Menu';
import SaveIcon from '@mui/icons-material/Save';
import BoltIcon from '@mui/icons-material/Bolt';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import BackupIcon from '@mui/icons-material/Backup';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import RemoveIcon from '@mui/icons-material/Remove';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import UploadFileIcon from "@mui/icons-material/UploadFile";

// local files
import { DiagramWrapper } from './graphComponents/DiagramWrapper';
import './App.css';
import { clouds, formats, nodeColor, nodeHighlightColor, pasteeeApiToken, pasteeePublicApiToken, pwd_hash, startNodeShape } from './Const';
import Info from './components/Info';
import { fiveTuple, getPowerGraph, getReachableGraph, graphToGrammar, makeAtomic, minimize, ofRegEx, removeEpsilon, reverseGraph, toLatex, toRegEx, intersectionGraph, isEquiv, differenceGraph } from './GraphUtils';
import { Cloud, ControlledAccess, Format, Graph, Paste } from "./Interfaces";
import Multi from './components/Multi';
import Single from './components/Single';
import { convertToGraph, updateModelWithGraph } from './GraphConversion';

// constants
const initNodes: go.ObjectData[] = [
  { key: 0, text: 'Start', color: nodeColor, loc: '0 0', deletable: false, figure: startNodeShape },
];
const initLinks: go.ObjectData[] = [];


// helper functions
const clearCacheData = () => {
  caches.keys().then((names) => {
    names.forEach((name) => {
      caches.delete(name);
    });
  });
  localStorage.clear();
  // reload to take effect
  window.location.reload();
};


function getHandleModelChange(
  nodeDataArray: go.ObjectData[],
  linkDataArray: go.ObjectData[],
  mapNodeKeyIdx: Map<go.Key, number>,
  mapLinkKeyIdx: Map<go.Key, number>,
  setModelData: (data: go.ObjectData) => void,

  updateNodes: (nodes: go.ObjectData[]) => void,
  updateLinks: (links: go.ObjectData[]) => void,

  setSkipsDiagramUpdate: React.Dispatch<React.SetStateAction<boolean>>,
) {
  return (obj: go.IncrementalData) => {
    const insertedNodeKeys = obj.insertedNodeKeys;
    const modifiedNodeData = obj.modifiedNodeData;
    const removedNodeKeys = obj.removedNodeKeys;
    const insertedLinkKeys = obj.insertedLinkKeys;
    const modifiedLinkData = obj.modifiedLinkData;
    const removedLinkKeys = obj.removedLinkKeys;
    const modifiedModelData = obj.modelData;

    // maintain maps of modified data so insertions don't need slow lookups
    const modifiedNodeMap = new Map<go.Key, go.ObjectData>();
    const modifiedLinkMap = new Map<go.Key, go.ObjectData>();
    let narr = nodeDataArray;
    if (modifiedNodeData) {
      modifiedNodeData.forEach((nd: go.ObjectData) => {
        modifiedNodeMap.set(nd.key, nd);
        const idx = mapNodeKeyIdx.get(nd.key);
        if (idx !== undefined && idx >= 0) {
          narr[idx] = nd;
        }
      });
    }
    if (insertedNodeKeys) {
      insertedNodeKeys.forEach((key: go.Key) => {
        const nd = modifiedNodeMap.get(key);
        const idx = mapNodeKeyIdx.get(key);
        if (nd && idx === undefined) {  // nodes won't be added if they already exist
          mapNodeKeyIdx.set(nd.key, narr.length);
          narr.push(nd);
        }
      });
    }
    if (removedNodeKeys) {
      narr = narr.filter((nd: go.ObjectData) => {
        if (removedNodeKeys.includes(nd.key)) {
          return false;
        }
        return true;
      });
      updateNodes(narr);
    }

    let larr = linkDataArray;
    if (modifiedLinkData) {
      modifiedLinkData.forEach((ld: go.ObjectData) => {
        modifiedLinkMap.set(ld.key, ld);
        const idx = mapLinkKeyIdx.get(ld.key);
        if (idx !== undefined && idx >= 0) {
          larr[idx] = ld;
        }
      });
    }
    if (insertedLinkKeys) {
      insertedLinkKeys.forEach((key: go.Key) => {
        const ld = modifiedLinkMap.get(key);
        const idx = mapLinkKeyIdx.get(key);
        if (ld && idx === undefined) {  // links won't be added if they already exist
          mapLinkKeyIdx.set(ld.key, larr.length);
          larr.push(ld);
        }
      });
    }
    if (removedLinkKeys) {
      larr = larr.filter((ld: go.ObjectData) => {
        if (removedLinkKeys.includes(ld.key)) {
          return false;
        }
        return true;
      });
      updateLinks(larr);
    }
    // handle model data changes, for now just replacing with the supplied object
    if (modifiedModelData) {
      setModelData(modifiedModelData);
    }
    setSkipsDiagramUpdate(true); // the GoJS model already knows about these updates

    updateNodes(narr);
    updateLinks(larr);
  }
}

function hash(
  str: string,
  callback: (err: Error, derivedKey: Buffer) => void
) {
  pbkdf2.pbkdf2(
    str,
    'aZN00cGoN1XgYcArVhIz',
    10000,
    64,
    'sha512',
    callback
  );
}

function uploadPaste(
  filename: string, paste: string, token: string,
  addPaste: (paste: Paste) => void,
  popupMessage: (message: string) => void,
) {
  console.log("uploadPaste", filename, token);
  axios.post('https://api.paste.ee/v1/pastes',
    {
      'description': filename,
      'sections': [
        {
          'name': 'Automaton ' + filename,
          'syntax': 'json',
          'contents': paste,
        },
      ]
    },
    {
      headers: {
        'content-type': 'application/json',
        'X-Auth-Token': token,
      }
    }).then((res) => {
      const id = res.data.id;
      const link = res.data.link
      addPaste({
        id: id,
        description: filename,
      });
      const urlWithId = window.location.href.replace(window.location.search, '?paste=' + id);
      popupMessage("Uploaded with id " + id + "\n" + link + "\nAccess directly via " + urlWithId);
    }).catch((err) => {
      console.log("err", err);
      popupMessage("Error uploading paste");
    });
}
const readPaste = (id: string, token: string, cont: (s: string) => void, err: (err: Error) => void) => {
  console.log("readPaste", id, token);
  axios.get('https://api.paste.ee/v1/pastes/' + id,
    {
      headers: {
        'X-Auth-Token': token,
      }
    }).then((res) => {
      const paste = res.data.paste.sections[0].contents;
      cont(paste);
    }).catch(err);
};

const openInNewTab = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); };


function App() {
  // diagram data
  const [nodeDataArray, setNodeDataArray] = createPersistedState<Array<go.ObjectData>>('nodeArray')(initNodes);
  const [linkDataArray, setLinkDataArray] = createPersistedState<Array<go.ObjectData>>('linkArray')(initLinks);
  const [modelData, setModelData] = createPersistedState<go.ObjectData>('modelData')({ canRelink: true });
  const [skipsDiagramUpdate, setSkipsDiagramUpdate] = React.useState<boolean>(false);
  var mapNodeKeyIdx: Map<go.Key, number> = new Map<go.Key, number>();
  var mapLinkKeyIdx: Map<go.Key, number> = new Map<go.Key, number>();
  const diagramRef = React.useRef<ReactDiagram>(null);


  // diagram functions
  const refreshNodeIndex = (nodeArr: Array<go.ObjectData>) => {
    mapNodeKeyIdx.clear();
    nodeArr.forEach((n: go.ObjectData, idx: number) => {
      mapNodeKeyIdx.set(n.key, idx);
    });
  }
  const refreshLinkIndex = (linkArr: Array<go.ObjectData>) => {
    mapLinkKeyIdx.clear();
    linkArr.forEach((l: go.ObjectData, idx: number) => {
      mapLinkKeyIdx.set(l.key, idx);
    });
  }
  const handleModelChange = getHandleModelChange(
    nodeDataArray,
    linkDataArray,
    mapNodeKeyIdx,
    mapLinkKeyIdx,
    setModelData,
    (nodes: go.ObjectData[]) => {
      setNodeDataArray(nodes);
      refreshNodeIndex(nodes);
    },
    (links: go.ObjectData[]) => {
      setLinkDataArray(links);
      refreshLinkIndex(links);
    },
    setSkipsDiagramUpdate
  );


  // diagram related properties
  const [selectedNodes, setSelectedNodes] = React.useState<Set<number>>(new Set());


  // ui properties
  const [singleMulti, setSingleMulti] = createPersistedState<"single" | "multi">('singleMulti')('single');
  const [selectedFunction, setSelectedFunction] = createPersistedState<"intersection" | "difference" | "equivalence" | undefined>('selectedFunction')(undefined);
  const [formatStr, setFormatStr] = createPersistedState<string>("format")('');
  const format = formats.find((f) => f.name === formatStr);
  const [cloudStr, setCloudStr] = createPersistedState<string>("cloud")('');
  const cloud = clouds.find((c) => c.name === cloudStr);
  const [copyText, setCopyText] = React.useState('');
  const [showCopyPopup, setShowCopyPopup] = React.useState(false);
  const [importText, setImportText] = React.useState('');
  const [showImportPopup, setShowImportPopup] = React.useState(false);
  const [exportLanguage, setExportLanguage] = React.useState('javascript');
  // const [adminOverride, setAdminOverride] = createPersistedState<boolean>("adminOverride")(false);
  const [adminViaPwd, setAdminViaPwd] = React.useState(false);
  // const admin = adminViaPwd || adminOverride;
  const admin = adminViaPwd;
  const [ownPastes, setOwnPastes] = createPersistedState<Paste[]>("ownPastes")([]);
  const [showLoadPopup, setShowLoadPopup] = React.useState(false);
  const [showSelectPopup, setShowSelectPopup] = React.useState(false);
  const [loadText, setLoadText] = React.useState('');
  const [publicPastes, setPublicPastes] = React.useState<null | any[]>(null);
  const [showSavePopup, setShowSavePopup] = React.useState(false);
  const [saveText, setSaveText] = React.useState('');
  const [selectText, setSelectText] = createPersistedState<string>('selectText')('');


  // ui functions
  const handleSingleMultiChange = (
    event: React.MouseEvent<HTMLElement>,
    newValue: "single" | "multi",
  ) => {
    if (newValue && newValue !== singleMulti)
      setSingleMulti(newValue);
  };
  const selectFunction = (func: "intersection" | "difference" | "equivalence") => {
    setSelectedFunction(func);
    setShowSelectPopup(true);
  };
  const addOwnPaste = (paste: Paste) => {
    setOwnPastes((prev) => [...prev, paste]);
  };
  const showPasteError = (err: Error) => {
    console.log("err", err);
    popupMessage("Error reading paste");
  };
  const popupMessage = (message: string) => {
    setExportLanguage("text")
    setCopyText(message);
    setShowCopyPopup(true);
  };


  // logic properties
  const graph = convertToGraph(nodeDataArray, linkDataArray);
  const coloredNodeDataArray =
    nodeDataArray.map((node) => {
      const color = selectedNodes.has(node.key) ? nodeHighlightColor : nodeColor;
      return { ...node, color: color };
    });


  // logic functions
  const graphTransformer = (
    transformer: (graph: Graph) => Graph,
    adminOnly: boolean = false
  ) => {
    if (adminOnly && !admin) return;
    const newGraph = transformer(graph);
    if (newGraph) {
      updateModelWithGraph(newGraph, setNodeDataArray, setLinkDataArray);
    }
  };
  const graphFromStr = (str: string) => {
    const graph = JSON.parse(str) as Graph;
    if (graph) {
      updateModelWithGraph(graph, setNodeDataArray, setLinkDataArray);
      return true;
    }
    return false;
  };
  const importFromUrl = (searchParams: string) => {
    const queryParams = new URLSearchParams(searchParams);
    const enc = queryParams.get('graph');
    if (enc) {
      const json = lzbase62.decompress(enc);
      graphFromStr(json);
    }
  };
  const clearGraph = () =>
    graphTransformer((_) => { return { nodes: [{ id: 0, label: "Start", isAccepting: false }], links: [] } });


  // updating steps
  refreshNodeIndex(nodeDataArray);
  refreshLinkIndex(linkDataArray);
  React.useEffect(() => {
    // handle url params
    importFromUrl(window.location.search);

    const queryParams = new URLSearchParams(window.location.search);
    const pwd = queryParams.get('pwd');
    const paste = queryParams.get('paste');
    const toHash = queryParams.get('hash');
    if (toHash) {
      hash(
        toHash,
        (err: Error, derivedKey: Buffer) => {
          if (err) return;
          const hash = derivedKey.toString('hex');
          console.log("hash", hash);
        }
      );
    }

    if (pwd) {
      hash(
        pwd,
        (err: Error, derivedKey: Buffer) => {
          if (err) return;
          const hash = derivedKey.toString('hex');
          if (hash === pwd_hash)
            setAdminViaPwd(true);
        }
      );
    }

    if (paste) {
      readPasteId(paste);
    }
  }, []);



  const buttons = [
    {
      admin: true,
      icon: <ContentCutIcon />,
      click: () => graphTransformer(getReachableGraph, true),
      text: "Cut unreachable"
    },
    {
      admin: true,
      icon: <BoltIcon />,
      click: () => graphTransformer(getPowerGraph, true),
      text: "Power Automaton"
    },
    {
      admin: true,
      icon: <CloseFullscreenIcon />,
      click: () => graphTransformer(minimize, true),
      text: "Minimize"
    },
    {
      admin: true,
      icon: <SettingsBackupRestoreIcon />,
      click: () => graphTransformer(reverseGraph, true),
      text: "Reverse"
    },
    {
      admin: true,
      icon: null,
      click: () => selectFunction("intersection"),
      text: "Intersection"
    },
    {
      admin: true,
      icon: null,
      click: () => selectFunction("difference"),
      text: "Difference"
    },
    {
      admin: true,
      icon: null,
      click: () => selectFunction("equivalence"),
      text: "Equivalence"
    },
    {
      admin: true,
      icon: null,
      click: () => graphTransformer(makeAtomic, true),
      text: "Make atomic"
    },
    {
      admin: false,
      icon: <DeleteOutlineIcon />,
      click: clearCacheData,
      text: "Clear cache"
    },
    {
      admin: false,
      icon: <DeleteOutlineIcon />,
      click: clearGraph,
      text: "Clear graph"
    },
  ];






















  // TODO: move methods to own files (also the ones above)

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setShowLoadPopup(false);
    if (!e.target.files) {
      return;
    }
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (!evt?.target?.result) {
        return;
      }
      const { result } = evt.target;
      graphFromStr(result as string);
    };
    reader.readAsText(file, 'utf-8');
  };


  const loadGraphFromPasteID = (id: string, token: string) => {
    setPublicPastes(null);
    setShowLoadPopup(false);
    readPaste(id, token, (paste) => {
      const success = graphFromStr(paste);
      if (!success)
        popupMessage("Error loading paste");
    }, showPasteError);
  };

  const listPastes = async (token: string) => {
    console.log("listPastes", token);
    const res = await axios.get('https://api.paste.ee/v1/pastes',
      {
        headers: {
          'X-Auth-Token': token,
        }
      });
    const pastes = res.data.data;
    return pastes;
  };

  const renderPasteList = (list: Paste[], cont: (pasteId: string) => void) => {
    return (list.map((paste) =>
    (
      <Grid item style={{ width: "100%" }}>
        <Button
          key={paste.id}
          variant="contained"
          color="info"
          fullWidth
          startIcon={<FileOpenIcon />}
          onClick={() => cont(paste.id)}
          style={{ justifyContent: "flex-start" }}
        >
          {`${paste.description} (${paste.id})`}
        </Button>
      </Grid>
    )));
  };

  const loadPublicPastes = () => {
    if (publicPastes === null) {
      setPublicPastes([]);
      listPastes(pasteeePublicApiToken).then((pastes) => {
        setPublicPastes(pastes);
      });
    }
  };


  const canAccess = (access: ControlledAccess | undefined) => {
    if (!access)
      return false;
    if (access === 'Admin' && !admin)
      return false;
    if (access === 'Inaccessible')
      return false;
    // Public
    return true;
  };

  const renderLoadPopup = () => {
    if (!canAccess(cloud?.load)) {
      return <>Inaccessible</>;
    }

    switch (cloud?.name) {
      case 'File':
        return (
          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            fullWidth
            sx={{ marginRight: "1rem" }}
          >
            Upload Automaton
            <input type="file" hidden onChange={handleFileUpload} />
          </Button>
        );
      case 'Unlisted Pastebin':
        return (
          <Grid container direction="column" alignItems="center" spacing={1}>
            <Grid item style={{ width: "100%" }}>
              <TextField
                id="loadtext-filled-multiline-flexible"
                label="ID"
                fullWidth
                value={loadText}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setLoadText(event.target.value) }}
                variant="outlined"
              />
            </Grid>
            <Grid item style={{ width: "100%" }}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                startIcon={<FileOpenIcon />}
                onClick={() => loadGraphFromPasteID(loadText, pasteeeApiToken)}
              >
                Load
              </Button>
            </Grid>
            {
              renderPasteList(
                ownPastes,
                (pasteId) => loadGraphFromPasteID(pasteId, pasteeeApiToken)
              )
            }
          </Grid>
        );
      case "Public Pastebin":
        loadPublicPastes();
        return (
          <Grid container direction="column" alignItems="center" spacing={1}>
            {
              (publicPastes === null || publicPastes.length === 0) ?
                "Loading..." :
                renderPasteList(publicPastes, (pasteId) => loadGraphFromPasteID(pasteId, pasteeePublicApiToken))
            }
          </Grid>
        );
      default:
        break;
    }
    return <> </>
  };




  const saveGraph = () => {
    if (!canAccess(cloud?.save)) {
      return <>Inaccessible</>;
    }
    const graphStr = JSON.stringify(graph, null, 2);
    switch (cloud!.name) {
      case 'File':
        var data = new Blob([graphStr], { type: 'application/json;charset=utf8' });
        var csvURL = window.URL.createObjectURL(data);
        const tempLink = document.createElement('a');
        tempLink.href = csvURL;
        tempLink.setAttribute('download', saveText + '.json');
        tempLink.click();
        break;
      case 'Google Drive':
        break;
      case 'Dropbox':
        break;
      case 'Unlisted Pastebin':
        uploadPaste(saveText, graphStr, pasteeeApiToken, addOwnPaste, popupMessage);
        break;
      case 'Public Pastebin':
        uploadPaste(saveText, graphStr, pasteeePublicApiToken, addOwnPaste, popupMessage);
        break;
      default:
        return;
    }
    setShowSavePopup(false);
  };

  const importGraph = () => {
    setShowImportPopup(false);

    if (format?.adminOnly && !admin) {
      setCopyText("Admin only");
      setShowCopyPopup(true);
      return;
    }

    let new_graph = undefined;
    switch (format?.name) {
      case 'JSON':
        new_graph = JSON.parse(importText) as Graph;
        break;
      case 'URL':
        new_graph = importFromUrl("?" + importText.split('?')[1]);
        break;
      case 'RegEx':
        new_graph = ofRegEx(importText);
        break;
      default:
        console.log("Not handled import format");
        return;
    }
    if (new_graph) {
      updateModelWithGraph(new_graph, setNodeDataArray, setLinkDataArray);
    }
  };

  const exportGraph = () => {
    let output = "";
    if (format?.adminOnly && !admin) {
      output = "Admin only";
    } else {
      switch (format?.name) {
        case 'JSON':
          output = JSON.stringify(graph, null, 2);
          setExportLanguage("javascript");
          break;
        case 'URL':
          const json = JSON.stringify(graph);
          const enc = lzbase62.compress(json);
          output = window.location.origin + window.location.pathname + "?graph=" + enc;
          setExportLanguage("html");
          break;
        case 'LaTeX':
          output = toLatex(graph);
          setExportLanguage("latex");
          break;
        case '5-Tuple':
          output = fiveTuple(graph);
          setExportLanguage("text");
          break;
        case 'RegEx':
          output = toRegEx(graph);
          setExportLanguage("regex");
          break;
        case 'Grammar':
          output = graphToGrammar(graph);
          setExportLanguage("text");
          break;
        case 'Image':
          const diagram = diagramRef.current?.getDiagram();
          const filename = "automaton.png";
          diagram?.makeImageData({
            background: "white",
            returnType: "blob",
            callback: (blob) => {
              downloadjs(blob, filename);
            }
          });
          return;
        case 'SVG':
          const diagram2 = diagramRef.current?.getDiagram();
          const svg = diagram2?.makeSvg({
            scale: 1,
            background: "white",
            padding: 10
          });
          const svgStr = new XMLSerializer().serializeToString(svg!);
          const blob = new Blob([svgStr], { type: "image/svg+xml" });
          downloadjs(blob, "automaton.svg");
          return;
        default:
          console.log("Not handled export format");
          return;
      }
    }
    setCopyText(output);
    setShowCopyPopup(true);
  };






  const readPasteId = (pasteId: string) => {
    readPaste(pasteId, pasteeeApiToken, (paste) => {
      graphFromStr(paste);
    }, (err) => {
      // console.log("Error reading private paste", err);
      readPaste(pasteId, pasteeePublicApiToken, (paste) => {
        graphFromStr(paste);
      }, (err) => {
        // console.log("Error reading public paste", err);
        popupMessage("Paste " + pasteId + " not found");
      });
    });
  };




  const handleSelectedFunction = (pasteId: string, token: string) => {
    setPublicPastes(null);
    setShowSelectPopup(false);
    readPaste(pasteId, token, (paste) => {
      const graph1 = graph;
      const graph2 = JSON.parse(paste) as Graph;
      if (!graph2) {
        popupMessage("Error loading paste");
      }
      switch (selectedFunction) {
        case 'intersection':
        case 'difference':
          let new_graph;
          switch (selectedFunction) {
            case 'intersection':
              new_graph = intersectionGraph(graph1, graph2);
              break;
            case 'difference':
              new_graph = differenceGraph(graph1, graph2);
              break;
            default:
          }
          if (new_graph) {
            updateModelWithGraph(new_graph, setNodeDataArray, setLinkDataArray);
          }
          break;
        case 'equivalence':
          const isEquivalent = isEquiv(graph1, graph2);
          popupMessage(isEquivalent ? "Both graphs are equivalent" : "The graphs are not equivalent");
          break;
      }
    }, showPasteError);

  };


  const renderSelectPopup = () => {
    loadPublicPastes();
    return (<Grid container direction="column" alignItems="center" spacing={1}>
      <Grid item style={{ width: "100%" }}>
        <TextField
          id="selecttext-filled-multiline-flexible"
          label="Paste-ID"
          fullWidth
          value={loadText}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => { setSelectText(event.target.value) }}
          variant="outlined"
        />
      </Grid>
      <Grid item style={{ width: "100%" }}>
        <Button
          variant="contained"
          color="primary"
          fullWidth
          startIcon={<FileOpenIcon />}
          onClick={() => handleSelectedFunction(selectText, pasteeeApiToken)}
        >
          Load
        </Button>
      </Grid>
      {
        (publicPastes === null || publicPastes.length === 0) ?
          "Loading..." :
          renderPasteList(publicPastes, (pasteId) => handleSelectedFunction(pasteId, pasteeePublicApiToken))
      }
      {
        renderPasteList(
          ownPastes,
          (pasteId) => handleSelectedFunction(pasteId, pasteeeApiToken)
        )
      }
    </Grid>);
  };


  return (
    <div className='app'>
      <p>
        Old version of the automaton editor: <a href="https://neuralcoder3.github.io/automaton/">https://neuralcoder3.github.io/automaton/</a>
      </p>
      <div className='topButtonBar'>
        <Grid container direction="row" alignItems="center" spacing={2} >
          <Grid item>
            <FormControl fullWidth style={{ minWidth: 120 }} >
              <InputLabel id="cloud-select-label">Cloud</InputLabel>
              <Select
                labelId="cloud-select-label"
                id="cloud-select"
                value={cloudStr}
                label="Cloud"
                onChange={(event) => setCloudStr(event.target.value as string)}
              >
                {
                  clouds.filter(
                    (c) => canAccess(c.load) || canAccess(c.save)
                  ).map((cloud: Cloud) => {
                    return <MenuItem value={cloud.name}>{cloud.name}</MenuItem>
                  })
                }
              </Select>
            </FormControl>
          </Grid>

          <Grid item>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              disabled={!canAccess(cloud?.save)}
              onClick={() => setShowSavePopup(true)}
            >
              Save
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              color="primary"
              startIcon={<FileOpenIcon />}
              disabled={!canAccess(cloud?.load)}
              onClick={() => setShowLoadPopup(true)}
            >
              Load
            </Button>
          </Grid>


          <Grid item>
            <FormControl fullWidth style={{ minWidth: 120 }} >
              <InputLabel id="format-select-label">Format</InputLabel>
              <Select
                labelId="format-select-label"
                id="format-select"
                value={formatStr}
                label="Format"
                onChange={(event) => setFormatStr(event.target.value as string)}
              >
                {
                  formats.filter(
                    (f) => admin || !f.adminOnly
                  ).map((format: Format) => {
                    return <MenuItem value={format.name}>{format.name}</MenuItem>
                  })
                }
              </Select>
            </FormControl>
          </Grid>

          <Grid item>
            <Button
              variant="contained"
              color="primary"
              startIcon={<BackupIcon />}
              disabled={format ? !format.import : true}
              onClick={() => setShowImportPopup(true)}
            >
              Import
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              color="primary"
              startIcon={<CloudDownloadIcon />}
              disabled={format ? !format.export : true}
              onClick={exportGraph}
            >
              Export
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              color="primary"
              startIcon={<FeedbackIcon />}
              onClick={() => openInNewTab('https://github.com/NeuralCoder3/AutomataEditor/issues/new/choose')}
            >
              Feedback
            </Button>
          </Grid>
        </Grid>
      </div>
      <DiagramWrapper
        diagramRef={diagramRef}
        nodeDataArray={coloredNodeDataArray}
        linkDataArray={linkDataArray}
        modelData={modelData}
        skipsDiagramUpdate={skipsDiagramUpdate}
        onDiagramEvent={() => { }}
        onModelChange={handleModelChange}
      />
      <Info />
      <div className='mainButtonBar'>
        <Grid container direction="row" alignItems="center" spacing={2} >
          <Grid item>
            <ToggleButtonGroup
              value={singleMulti}
              exclusive
              onChange={handleSingleMultiChange}
              aria-label="text alignment"
              size='small'
            >
              <ToggleButton value="single" aria-label="left aligned">
                <RemoveIcon />
              </ToggleButton>
              <ToggleButton value="multi" aria-label="centered">
                <MenuIcon />
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid>
          {
            buttons.map(
              (button) => {
                return (button.admin && !admin) ? null : (
                  <Grid item>
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={button.icon}
                      onClick={button.click}
                    >
                      {button.text}
                    </Button>
                  </Grid>
                )
              }
            )
          }
          {/* <Grid item>
            <ToggleButtonGroup
              value={admin ? 'admin' : 'normal'}
              exclusive
              onChange={
                (
                  event: React.MouseEvent<HTMLElement>,
                  newValue: "admin" | "normal",
                ) => {
                  setAdminOverride(newValue === "admin");
                }
              }
              aria-label="text alignment"
              size='small'
            >
              <ToggleButton value="normal" aria-label="left aligned">
                Normal
              </ToggleButton>
              <ToggleButton value="admin" aria-label="centered">
                Super
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid> */}
        </Grid>
      </div>
      <div style={{ "width": "100%" }}>
        {singleMulti === 'single' ? <Single graph={graph} colorNodes={setSelectedNodes} /> : <Multi graph={graph} />}
      </div>


      <Popup open={showCopyPopup} onClose={() => setShowCopyPopup(false)} modal>
        <div style={{ "overflowY": "auto", "maxHeight": "100vh" }}>
          <CodeBlock highlight={true} >
            <pre>
              <Highlight className={"language-" + exportLanguage}>
                {copyText}
              </Highlight>
            </pre>
          </CodeBlock>
          {
            exportLanguage.toLowerCase() === 'latex' && format?.name === 'LaTeX' &&
            <form className="center" action="https://www.overleaf.com/docs" method="post" target="_blank">
              <textarea id="output" name="snip" style={{ "display": "none" }} >
                {copyText}
              </textarea>
              <Button
                variant="contained"
                type='submit'
                color="primary"
                fullWidth
                startIcon={<Icon icon="mdi:leaf" />}
              >
                Open in Overleaf
              </Button>
            </form>

          }
        </div>
      </Popup>

      <Popup open={showImportPopup} onClose={() => setShowImportPopup(false)} modal>
        <div>

          <Grid container direction="column" alignItems="center" spacing={2}>
            <Grid item style={{ width: "100%" }}>
              <TextField
                id="import-filled-multiline-flexible"
                label="Import String"
                fullWidth
                multiline
                rows={6}
                value={importText}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setImportText(event.target.value)}
                variant="outlined"
              />
            </Grid>
            <Grid item>
              <Button
                variant="contained"
                color="primary"
                startIcon={<BackupIcon />}
                onClick={importGraph}
              >
                Import
              </Button>
            </Grid>
          </Grid>
        </div>
      </Popup>

      <Popup open={showSavePopup} onClose={() => setShowSavePopup(false)} modal>
        <div>

          <Grid container direction="column" alignItems="center" spacing={2}>
            <Grid item style={{ width: "100%" }}>
              <TextField
                id="save-filled-multiline-flexible"
                label="Filename"
                fullWidth
                value={saveText}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSaveText(event.target.value)}
                variant="outlined"
              />
            </Grid>
            <Grid item style={{ width: "100%" }}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                startIcon={<SaveIcon />}
                onClick={saveGraph}
              >
                Save
              </Button>
            </Grid>
          </Grid>
        </div>
      </Popup >

      <Popup open={showLoadPopup} onClose={() => { setShowLoadPopup(false); setPublicPastes(null); }} modal>
        <div style={{ "overflowY": "auto", "maxHeight": "100vh" }}>
          {renderLoadPopup()}
        </div>
      </Popup>

      <Popup open={showSelectPopup} onClose={() => { setShowSelectPopup(false); setPublicPastes(null); }} modal>
        <div style={{ "overflowY": "auto", "maxHeight": "100vh" }}>
          {renderSelectPopup()}
        </div>
      </Popup>

    </div >
  );

}

export default App;
