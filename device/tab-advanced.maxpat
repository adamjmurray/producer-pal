{
	"patcher" : 	{
		"fileversion" : 1,
		"appversion" : 		{
			"major" : 9,
			"minor" : 0,
			"revision" : 7,
			"architecture" : "x64",
			"modernui" : 1
		}
,
		"classnamespace" : "box",
		"rect" : [ 187.0, 458.0, 538.0, 447.0 ],
		"openinpresentation" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"id" : "obj-15",
					"linecount" : 5,
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 351.0, 225.551402151584625, 170.0, 74.0 ],
					"text" : "Attempt to avoid a \"Node script not ready can't handle message verbose\" error.\nTODO: Needs a robust sotluion"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-11",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 275.0, 253.0, 61.0, 22.0 ],
					"text" : "pipe 1000"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-14",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 274.766353011131287, 290.551402151584625, 68.0, 22.0 ],
					"text" : "verbose $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-9",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 274.766353011131287, 327.0, 89.0, 22.0 ],
					"text" : "s ---node-script"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
					"annotation_name" : "Verbose logging",
					"id" : "obj-8",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 275.0, 213.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 124.0, 37.481310427188873, 15.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Verbose logging",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
							"parameter_initial" : [ 0.0 ],
							"parameter_initial_enable" : 1,
							"parameter_invisible" : 1,
							"parameter_longname" : "live.toggle",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "live.toggle",
							"parameter_type" : 2
						}

					}
,
					"varname" : "verbose-logging"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-6",
					"linecount" : 2,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 296.766353011131287, 188.0, 45.0, 29.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 42.523366868495941, 35.981310427188873, 76.0, 18.0 ],
					"text" : "Verbose logging",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"bgmode" : 0,
					"border" : 0,
					"clickthrough" : 0,
					"enablehscroll" : 0,
					"enablevscroll" : 0,
					"id" : "obj-4",
					"lockeddragscroll" : 0,
					"lockedsize" : 0,
					"maxclass" : "bpatcher",
					"name" : "server-status.maxpat",
					"numinlets" : 0,
					"numoutlets" : 0,
					"offset" : [ 0.0, 0.0 ],
					"patching_rect" : [ 52.25, 63.0, 165.0, 23.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 42.5, 95.0, 165.0, 23.0 ],
					"viewvisibility" : 1
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-24",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 27.0, 327.0, 107.0, 22.0 ],
					"text" : "s ---stop-if-running"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-13",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 37.5, 261.0, 50.0, 22.0 ],
					"text" : "s ---port"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-12",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 130.5, 261.0, 89.0, 22.0 ],
					"text" : "s ---timeout-ms"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-3",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "bang", "int" ],
					"patching_rect" : [ 27.0, 215.0, 29.5, 22.0 ],
					"text" : "t b i"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-25",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "bang", "int" ],
					"patching_rect" : [ 120.0, 215.0, 29.5, 22.0 ],
					"text" : "t b i"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-74",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "int" ],
					"patching_rect" : [ 120.0, 171.0, 43.0, 22.0 ],
					"text" : "* 1000"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Maximum time to wait for AI tool operations to complete. Default is 15 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
					"annotation_name" : "Timeout",
					"id" : "obj-68",
					"maxclass" : "live.numbox",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "float" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 119.5, 134.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 124.0, 71.593461871147156, 44.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Timeout",
							"parameter_info" : "Maximum time to wait for AI tool operations to complete. Default is 15 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
							"parameter_initial" : [ 30.0 ],
							"parameter_initial_enable" : 1,
							"parameter_invisible" : 1,
							"parameter_longname" : "timeout",
							"parameter_mmax" : 60.0,
							"parameter_mmin" : 1.0,
							"parameter_modmode" : 4,
							"parameter_shortname" : "timeout",
							"parameter_type" : 1,
							"parameter_units" : "sec",
							"parameter_unitstyle" : 9
						}

					}
,
					"varname" : "timeout"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-67",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 114.5, 104.0, 54.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 69.15888237953186, 70.093461871147156, 50.0, 18.0 ],
					"text" : "Timeout",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-66",
					"linecount" : 2,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 28.0, 102.0, 43.0, 29.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 58.0, 53.0, 61.0, 18.0 ],
					"text" : " Server port",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Only change if you have port conflicts with other software. If changed, the Max for Live device URL must be updated to match in the Claude Desktop extension settings.",
					"annotation_name" : "Server port",
					"id" : "obj-64",
					"maxclass" : "live.numbox",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "float" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 27.0, 137.5, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 124.0, 54.5, 44.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Server port",
							"parameter_info" : "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Only change if you have port conflicts with other software. If changed, the Max for Live device URL must be updated to match in the Claude Desktop extension settings.",
							"parameter_initial" : [ 3350 ],
							"parameter_initial_enable" : 1,
							"parameter_invisible" : 1,
							"parameter_longname" : "port",
							"parameter_mmax" : 3555.0,
							"parameter_mmin" : 3300.0,
							"parameter_modmode" : 4,
							"parameter_shortname" : "port",
							"parameter_type" : 1,
							"parameter_unitstyle" : 0
						}

					}
,
					"varname" : "port"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-7",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 279.0, 134.0, 53.0, 22.0 ],
					"text" : "s ---stop"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-5",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 209.0, 134.0, 53.0, 22.0 ],
					"text" : "s ---start"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Stop Producer Pal's server for AI connectivity. Use this to troubleshoot connection issues or for freeing up the port to connect to the device in the Max patch editor.",
					"annotation_name" : "Stop server",
					"id" : "obj-70",
					"maxclass" : "live.text",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 279.0, 101.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 142.0, 126.0, 44.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Stop server",
							"parameter_enum" : [ "val1", "val2" ],
							"parameter_info" : "Stop Producer Pal's server for AI connectivity. Use this to troubleshoot connection issues or for freeing up the port to connect to the device in the Max patch editor.",
							"parameter_invisible" : 2,
							"parameter_longname" : "live.text[1]",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "live.text",
							"parameter_type" : 2
						}

					}
,
					"text" : "stop",
					"varname" : "live.text[1]"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Manually start Producer Pal's server for AI connectivity. This normally happens automatically when the device loads. It needs to be restarted after changing advanced settings.",
					"annotation_name" : "Start server",
					"id" : "obj-69",
					"maxclass" : "live.text",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 209.0, 101.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 63.0, 126.0, 44.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Start server",
							"parameter_enum" : [ "val1", "val2" ],
							"parameter_info" : "Manually start Producer Pal's server for AI connectivity. This normally happens automatically when the device loads. It needs to be restarted after changing advanced settings.",
							"parameter_invisible" : 2,
							"parameter_longname" : "live.text",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "live.text",
							"parameter_type" : 2
						}

					}
,
					"text" : "start",
					"varname" : "live.text"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-2",
					"linecount" : 3,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 52.0, 7.0, 150.0, 41.0 ],
					"presentation" : 1,
					"presentation_linecount" : 2,
					"presentation_rect" : [ 15.0, 4.0, 220.0, 29.0 ],
					"text" : "Warning: Only change advanced settings if you know what you're doing or are experiencing issues",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"background" : 1,
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"id" : "obj-1",
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 0.0, 0.0, 34.0, 32.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, 0.0, 250.0, 150.0 ],
					"proportion" : 0.39,
					"rounded" : 0
				}

			}
 ],
		"lines" : [ 			{
				"patchline" : 				{
					"destination" : [ "obj-14", 0 ],
					"source" : [ "obj-11", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-9", 0 ],
					"source" : [ "obj-14", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-12", 0 ],
					"source" : [ "obj-25", 1 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-24", 0 ],
					"source" : [ "obj-25", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-13", 0 ],
					"source" : [ "obj-3", 1 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-24", 0 ],
					"source" : [ "obj-3", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-3", 0 ],
					"source" : [ "obj-64", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-74", 0 ],
					"source" : [ "obj-68", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-5", 0 ],
					"source" : [ "obj-69", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-7", 0 ],
					"source" : [ "obj-70", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-25", 0 ],
					"source" : [ "obj-74", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-11", 0 ],
					"source" : [ "obj-8", 0 ]
				}

			}
 ],
		"parameters" : 		{
			"obj-64" : [ "port", "port", 0 ],
			"obj-68" : [ "timeout", "timeout", 0 ],
			"obj-69" : [ "live.text", "live.text", 0 ],
			"obj-70" : [ "live.text[1]", "live.text", 0 ],
			"obj-8" : [ "live.toggle", "live.toggle", 0 ],
			"parameterbanks" : 			{
				"0" : 				{
					"index" : 0,
					"name" : "",
					"parameters" : [ "-", "-", "-", "-", "-", "-", "-", "-" ]
				}

			}
,
			"inherited_shortname" : 1
		}
,
		"dependency_cache" : [ 			{
				"name" : "server-status.maxpat",
				"bootpath" : "~/workspace/producer-pal/device",
				"patcherrelativepath" : ".",
				"type" : "JSON",
				"implicit" : 1
			}
 ],
		"autosave" : 0
	}

}
