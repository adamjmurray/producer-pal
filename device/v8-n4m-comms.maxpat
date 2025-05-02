{
	"patcher" : 	{
		"fileversion" : 1,
		"appversion" : 		{
			"major" : 9,
			"minor" : 0,
			"revision" : 6,
			"architecture" : "x64",
			"modernui" : 1
		}
,
		"classnamespace" : "box",
		"rect" : [ 61.0, 131.0, 1000.0, 780.0 ],
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"id" : "obj-11",
					"linecount" : 2,
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 441.0, 451.0, 169.0, 35.0 ],
					"presentation_linecount" : 2,
					"text" : "mcp_response {\\\"success\\\":true}"
				}

			}
, 			{
				"box" : 				{
					"code" : "const toString = (any) => {\n  const s = String(any);\n  return s.includes(\"[object Object]\") ? JSON.stringify(any) : s;\n}\nconst log = (...any) => post(...any.map(toString), \"\\n\");\nconst error = (...any) => globalThis.error(...any.map(toString), \"\\n\");\nlog(\"------------------------------------------------,\\n\", new Date());\r\n\r\nfunction mcp_request(serializedJSON) {\n  try {\n    const request = JSON.parse(serializedJSON);\r\n    log(\"got message\", request.message);\r\n    outlet(0, \"mcp_response\", JSON.stringify({success: true}));\r\n  } catch(e) {\r\n\terror(e);\r\n  }\r\n}",
					"filename" : "none",
					"fontface" : 0,
					"fontname" : "<Monospaced>",
					"fontsize" : 12.0,
					"id" : "obj-9",
					"maxclass" : "v8.codebox",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 397.0, 93.0, 568.0, 264.0 ],
					"saved_object_attributes" : 					{
						"parameter_enable" : 0
					}
,
					"varname" : "v8_AA"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-7",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 92.0, 34.0, 64.0, 22.0 ],
					"text" : "script start"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-5",
					"maxclass" : "button",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "bang" ],
					"parameter_enable" : 0,
					"patching_rect" : [ 37.0, 26.0, 24.0, 24.0 ]
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-3",
					"linecount" : 2,
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 39.5, 451.0, 169.0, 35.0 ],
					"text" : "mcp_request {\\\"message\\\":\\\"hi\\\"}"
				}

			}
, 			{
				"box" : 				{
					"code" : "const Max = require('max-api');\nMax.addHandler(\"bang\", () => {\n  Max.outlet(\r\n    \"mcp_request\", \r\n    JSON.stringify({message: 'hi'})\r\n  );\n});\r\n\r\nMax.addHandler(\"mcp_response\", (serialized) => {\n  Max.post(\"got response: \" + serialized);\n});",
					"fontface" : 0,
					"fontname" : "<Monospaced>",
					"fontsize" : 12.0,
					"id" : "obj-1",
					"maxclass" : "node.codebox",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 29.0, 93.0, 366.0, 264.0 ],
					"saved_object_attributes" : 					{
						"autostart" : 1,
						"defer" : 0,
						"node_bin_path" : "",
						"npm_bin_path" : "",
						"watch" : 1
					}

				}

			}
 ],
		"lines" : [ 			{
				"patchline" : 				{
					"destination" : [ "obj-3", 1 ],
					"order" : 1,
					"source" : [ "obj-1", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-9", 0 ],
					"order" : 0,
					"source" : [ "obj-1", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-1", 0 ],
					"source" : [ "obj-5", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-1", 0 ],
					"source" : [ "obj-7", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-1", 0 ],
					"order" : 1,
					"source" : [ "obj-9", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-11", 1 ],
					"order" : 0,
					"source" : [ "obj-9", 0 ]
				}

			}
 ],
		"dependency_cache" : [ 			{
				"name" : "u586002239.js",
				"bootpath" : "~/Library/Application Support/Cycling '74/Max 9/Settings/temp64-Max",
				"patcherrelativepath" : "../../../Library/Application Support/Cycling '74/Max 9/Settings/temp64-Max",
				"type" : "TEXT",
				"implicit" : 1
			}
 ],
		"autosave" : 0
	}

}
