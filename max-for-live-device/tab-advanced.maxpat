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
		"rect" : [ 207.0, 428.0, 757.0, 427.0 ],
		"openinpresentation" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"annotation" : "Enable for smaller local LLMs. Simplifies features to reduce confusion.",
					"annotation_name" : "Small Model Mode",
					"id" : "obj-21",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 598.5, 185.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 127.0, 21.0, 15.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Small Model Mode",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Enable for smaller local LLMs. Simplifies features to reduce confusion.",
							"parameter_initial" : [ 0 ],
							"parameter_initial_enable" : 1,
							"parameter_invisible" : 1,
							"parameter_longname" : "small-model-mode",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "small-model-mode",
							"parameter_type" : 2
						}

					}
,
					"varname" : "small-model-mode"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Return standard JSON for responses, which can aid debugging and custom integrations. This is more verbose than the default output format, which is designed to reduce LLM context window usage.",
					"annotation_name" : "JSON Output",
					"id" : "obj-17",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 457.5, 125.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 127.0, 40.0, 15.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "JSON Output",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Return standard JSON for responses, which can aid debugging and custom integrations. This is more verbose than the default output format, which is designed to reduce LLM context window usage.",
							"parameter_initial" : [ 0 ],
							"parameter_initial_enable" : 1,
							"parameter_invisible" : 1,
							"parameter_longname" : "json-output",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "json-output",
							"parameter_type" : 2
						}

					}
,
					"varname" : "json-output"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Maximum time to wait for AI tool operations to complete. Default is 30 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
					"annotation_name" : "Timeout",
					"id" : "obj-68",
					"maxclass" : "live.numbox",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "float" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 119.5, 134.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 127.0, 78.0, 44.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Timeout",
							"parameter_info" : "Maximum time to wait for AI tool operations to complete. Default is 30 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
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
					"annotation" : "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Change if you have port conflicts with other software. If changed, the AI's MCP connection settings must be updated to match (e.g. in Claude Desktop extension settings).",
					"annotation_name" : "Server Port",
					"id" : "obj-64",
					"maxclass" : "live.numbox",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "float" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 27.0, 137.5, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 127.0, 97.0, 44.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Server Port",
							"parameter_info" : "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Change if you have port conflicts with other software. If changed, the AI's MCP connection settings must be updated to match (e.g. in Claude Desktop extension settings).",
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
					"annotation" : "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
					"annotation_name" : "Verbose Logs",
					"id" : "obj-8",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 239.0, 176.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 127.0, 59.0, 15.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Verbose Logs",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
							"parameter_initial" : [ 0.0 ],
							"parameter_initial_enable" : 1,
							"parameter_invisible" : 1,
							"parameter_longname" : "verbose-logs",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "verbose-logs",
							"parameter_type" : 2
						}

					}
,
					"varname" : "verbose-logs"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Change if you have port conflicts with other software. If changed, the AI's MCP connection settings must be updated to match (e.g. in Claude Desktop extension settings).",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-31",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 420.0, 161.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 16.078836843371391, 94.626555889844894, 217.842326313257217, 20.746888220310211 ],
					"proportion" : 0.39,
					"varname" : "Server Port"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Maximum time to wait for AI tool operations to complete. Default is 30 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-30",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 405.0, 146.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 16.078836843371391, 74.172012239694595, 217.842326313257217, 20.746888220310211 ],
					"proportion" : 0.39,
					"varname" : "Timeout"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-29",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 390.0, 131.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 16.078836843371391, 55.232619971036911, 217.842326313257217, 20.746888220310211 ],
					"proportion" : 0.39,
					"varname" : "Verbose Logs"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Return standard JSON for responses, which can aid debugging and custom integrations. This is more verbose than the default output format, which is designed to reduce LLM context window usage.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-28",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 375.0, 116.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 16.078836843371391, 36.293227702379227, 217.842326313257217, 20.746888220310211 ],
					"proportion" : 0.39,
					"varname" : "JSON Output"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Enable for smaller local language models. Simplifies features to reduce confusion. Enabling this will reduce Producer Pal's capabilities.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-27",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 360.0, 101.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 16.078836843371391, 18.11141112446785, 217.842326313257217, 20.746888220310211 ],
					"proportion" : 0.39,
					"varname" : "Small Model Mode"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-26",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "int" ],
					"patching_rect" : [ 457.0, 157.0, 29.5, 22.0 ],
					"text" : "!= 1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-23",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 598.0, 212.0, 61.0, 22.0 ],
					"text" : "pipe 1000"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-25",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 598.0, 250.0, 116.0, 22.0 ],
					"text" : "smallModelMode $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-22",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 590.0, 156.5, 88.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 26.0, 20.0, 96.0, 18.0 ],
					"text" : "Small Model Mode",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-19",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 457.0, 212.0, 61.0, 22.0 ],
					"text" : "pipe 1000"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-20",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 457.0, 250.0, 107.0, 22.0 ],
					"text" : "compactOutput $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-18",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 444.5, 104.0, 86.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 43.0, 39.0, 78.976633131504059, 18.0 ],
					"text" : "JSON Output",
					"textjustification" : 2
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
					"patching_rect" : [ 326.0, 60.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 214.0, 121.0, 36.0, 20.0 ],
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
					"patching_rect" : [ 256.0, 60.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, 121.0, 36.0, 20.0 ],
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
					"id" : "obj-67",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 114.5, 104.0, 54.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 72.0, 77.0, 50.0, 18.0 ],
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
					"presentation_rect" : [ 61.0, 96.0, 61.0, 18.0 ],
					"text" : " Server Port",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-12",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 457.0, 296.0, 42.0, 22.0 ],
					"text" : "s ---v8"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-10",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 120.0, 215.0, 61.0, 22.0 ],
					"text" : "pipe 1000"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-16",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 120.0, 257.0, 81.0, 22.0 ],
					"text" : "timeoutMs $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-15",
					"linecount" : 7,
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 311.0, 189.0, 130.0, 100.0 ],
					"text" : "The [pipe]s attempt to avoid a \"Node script not ready can't handle message verbose\" error.\nTODO: Needs a robust sotluion"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-11",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 239.0, 216.0, 61.0, 22.0 ],
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
					"patching_rect" : [ 239.0, 254.0, 68.0, 22.0 ],
					"text" : "verbose $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-9",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 239.0, 318.0, 89.0, 22.0 ],
					"text" : "s ---node-script"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-6",
					"linecount" : 2,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 261.0, 151.0, 45.0, 29.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 42.0, 58.0, 79.988316565752029, 18.0 ],
					"text" : "Verbose Logs",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"bgmode" : 0,
					"border" : 0,
					"clickthrough" : 1,
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
					"patching_rect" : [ 52.25, 63.0, 155.0, 40.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 31.0, 72.0, 213.0, 75.0 ],
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
					"id" : "obj-7",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 326.0, 93.0, 53.0, 22.0 ],
					"text" : "s ---stop"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-5",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 256.0, 93.0, 53.0, 22.0 ],
					"text" : "s ---start"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-2",
					"linecount" : 2,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 52.0, 7.0, 150.0, 29.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 15.0, 1.0, 220.0, 18.0 ],
					"text" : "Warning: For advanced users or troubleshooting",
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
					"destination" : [ "obj-16", 0 ],
					"source" : [ "obj-10", 0 ]
				}

			}
, 			{
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
					"destination" : [ "obj-9", 0 ],
					"source" : [ "obj-16", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-26", 0 ],
					"source" : [ "obj-17", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-20", 0 ],
					"source" : [ "obj-19", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-12", 0 ],
					"source" : [ "obj-20", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-23", 0 ],
					"source" : [ "obj-21", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-25", 0 ],
					"source" : [ "obj-23", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-12", 0 ],
					"source" : [ "obj-25", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-19", 0 ],
					"source" : [ "obj-26", 0 ]
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
					"destination" : [ "obj-10", 0 ],
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
			"obj-17" : [ "json-output", "json-output", 0 ],
			"obj-21" : [ "small-model-mode", "small-model-mode", 0 ],
			"obj-64" : [ "port", "port", 0 ],
			"obj-68" : [ "timeout", "timeout", 0 ],
			"obj-69" : [ "live.text", "live.text", 0 ],
			"obj-70" : [ "live.text[1]", "live.text", 0 ],
			"obj-8" : [ "verbose-logs", "verbose-logs", 0 ],
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
				"bootpath" : "~/workspace/producer-pal/max-for-live-device",
				"patcherrelativepath" : ".",
				"type" : "JSON",
				"implicit" : 1
			}
 ],
		"autosave" : 0
	}

}
