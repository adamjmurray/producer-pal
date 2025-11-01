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
		"rect" : [ 34.0, 243.0, 904.0, 716.0 ],
		"openinpresentation" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"id" : "obj-71",
					"linecount" : 2,
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 680.5, 37.5, 171.0, 35.0 ],
					"text" : "sprintf \\; max launch_browser http://localhost:%d/chat"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-62",
					"linecount" : 3,
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 19.0, 606.0, 98.0, 49.0 ],
					"text" : "script sendbox open-chat-ui hidden $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-4",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 59.0, 543.0, 29.5, 22.0 ],
					"text" : "0"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-58",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 19.0, 543.0, 29.5, 22.0 ],
					"text" : "1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-57",
					"maxclass" : "live.line",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 498.0, 351.0, 5.0, 100.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 4.0, 55.0, 136.0, 13.0 ]
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-56",
					"maxclass" : "live.line",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 508.0, 389.0, 5.0, 100.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 4.0, 113.0, 136.0, 13.0 ]
				}

			}
, 			{
				"box" : 				{
					"fontface" : 1,
					"fontsize" : 11.0,
					"id" : "obj-39",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 443.0, 68.0, 70.0, 20.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 153.0, 4.0, 53.846161000000002, 20.0 ],
					"text" : "Debug",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-61",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 374.0, 530.0, 129.0, 22.0 ],
					"text" : "activebgcolor 0 0.9 0 1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-60",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 401.0, 560.0, 119.0, 22.0 ],
					"text" : "activebgcolor 0 0 0 1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-59",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 430.0, 590.0, 129.0, 22.0 ],
					"text" : "activebgcolor 0.9 0 0 1"
				}

			}
, 			{
				"box" : 				{
					"activebgcolor" : [ 0.0, 0.9, 0.0, 1.0 ],
					"activebgoncolor" : [ 0.4, 0.0, 0.0, 1.0 ],
					"id" : "obj-55",
					"ignoreclick" : 1,
					"maxclass" : "live.button",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 375.0, 623.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 9.0, 28.0, 15.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"activebgcolor" : 						{
							"expression" : ""
						}
,
						"activebgoncolor" : 						{
							"expression" : ""
						}
,
						"valueof" : 						{
							"parameter_enum" : [ "off", "on" ],
							"parameter_longname" : "live.button",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "live.button",
							"parameter_type" : 2
						}

					}
,
					"varname" : "live.button"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Displays the current status of the Producer Pal server that AI uses to control Live. If it says anything other than \"Running\", AI will not be able to connect. Click the \"start\" button to manually start the server.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"id" : "obj-33",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 614.0, 404.0, 84.0, 94.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 6.0, 21.0, 61.0, 32.0 ],
					"proportion" : 0.39,
					"varname" : "Producer Pal Status"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-34",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 159.0, 558.0, 29.5, 22.0 ],
					"text" : "0"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-36",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 119.0, 558.0, 29.5, 22.0 ],
					"text" : "1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-53",
					"linecount" : 2,
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 134.0, 620.0, 134.0, 35.0 ],
					"text" : "script sendbox see-console hidden $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-43",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 134.0, 671.0, 67.0, 22.0 ],
					"save" : [ "#N", "thispatcher", ";", "#Q", "end", ";" ],
					"text" : "thispatcher"
				}

			}
, 			{
				"box" : 				{
					"bubble" : 1,
					"bubblepoint" : 0.0,
					"bubbleside" : 2,
					"fontsize" : 9.5,
					"hidden" : 1,
					"id" : "obj-38",
					"linecount" : 2,
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 195.0, 558.0, 66.0, 47.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 49.0, 2.0, 92.0, 36.0 ],
					"text" : "See Max Console",
					"textjustification" : 1,
					"varname" : "see-console"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-51",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 276.0, 453.0, 53.0, 22.0 ],
					"text" : "Stopped"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-49",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 150.0, 453.0, 53.0, 22.0 ],
					"text" : "Running"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-47",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 418.0, 453.0, 35.0, 22.0 ],
					"text" : "Error"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-45",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "bang" ],
					"patching_rect" : [ 382.0, 453.0, 22.0, 22.0 ],
					"text" : "t b"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-40",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "bang" ],
					"patching_rect" : [ 246.0, 453.0, 22.0, 22.0 ],
					"text" : "t b"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-41",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "bang" ],
					"patching_rect" : [ 118.0, 453.0, 22.0, 22.0 ],
					"text" : "t b"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-42",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 283.0, 579.0, 65.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 24.0, 27.0, 50.0, 18.0 ],
					"text" : "Running",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-44",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 118.0, 410.0, 95.0, 22.0 ],
					"text" : "r ---node-started"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-46",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 246.0, 410.0, 101.0, 22.0 ],
					"text" : "r ---node-stopped"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-48",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 382.0, 410.0, 84.0, 22.0 ],
					"text" : "r ---node-error"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-54",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 283.0, 550.0, 77.0, 22.0 ],
					"text" : "prepend set"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Open the built-in AI chat UI in a web browser.",
					"annotation_name" : "Open Chat UI",
					"fontsize" : 10.0,
					"hidden" : 1,
					"id" : "obj-32",
					"maxclass" : "live.text",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 557.5, 37.5, 83.0, 24.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 158.0, 106.0, 80.0, 20.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Open Chat UI",
							"parameter_enum" : [ "val1", "val2" ],
							"parameter_info" : "Open the built-in AI chat UI in a web browser.",
							"parameter_invisible" : 2,
							"parameter_longname" : "live.text[3]",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "live.text[3]",
							"parameter_type" : 2
						}

					}
,
					"text" : "Open Chat UI",
					"varname" : "open-chat-ui"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-35",
					"linecount" : 3,
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 557.5, 88.5, 142.0, 49.0 ],
					"text" : ";\rmax launch_browser http://localhost:3350/chat"
				}

			}
, 			{
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
					"presentation_rect" : [ 9.0, 125.0, 15.0, 15.0 ],
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
					"presentation_rect" : [ 157.0, 32.0, 15.0, 15.0 ],
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
					"presentation_rect" : [ 65.0, 88.0, 44.0, 15.0 ],
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
					"presentation_rect" : [ 65.0, 66.0, 44.0, 15.0 ],
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
					"presentation_rect" : [ 157.0, 58.0, 15.0, 15.0 ],
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
					"patching_rect" : [ 585.0, 376.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 4.00000011920929, 54.33333495259285, 135.99999988079071, 28.666667520999908 ],
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
					"patching_rect" : [ 570.0, 361.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 4.00000011920929, 85.000002533197403, 135.99999988079071, 25.999997466802597 ],
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
					"patching_rect" : [ 555.0, 346.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 150.000004470348358, 52.666668236255646, 95.999995529651642, 30.333331763744354 ],
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
					"patching_rect" : [ 540.0, 331.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 150.000004470348358, 25.00000074505806, 96.000002861022949, 27.99999925494194 ],
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
					"patching_rect" : [ 525.0, 316.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 4.00000011920929, 113.333336710929871, 135.666670709848404, 33.000000983476639 ],
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
					"patching_rect" : [ 590.0, 161.0, 88.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 26.0, 123.0, 87.0, 18.0 ],
					"text" : "Small Model Mode",
					"textjustification" : 0
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
					"presentation_rect" : [ 173.0, 30.0, 70.064096000000006, 18.0 ],
					"text" : "JSON Output",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Stop Producer Pal's server for AI connectivity. Use this to troubleshoot connection issues or for freeing up the port to connect to the device in the Max patch editor.",
					"annotation_name" : "Stop Server",
					"id" : "obj-70",
					"maxclass" : "live.text",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 326.0, 60.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 102.0, 28.0, 34.0, 18.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Stop Server",
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
					"annotation_name" : "Start Server",
					"id" : "obj-69",
					"maxclass" : "live.text",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 256.0, 60.0, 44.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 67.0, 28.0, 34.0, 18.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Start Server",
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
					"presentation_rect" : [ 18.0, 87.0, 45.0, 18.0 ],
					"text" : "Timeout",
					"textjustification" : 2
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-66",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 28.0, 102.0, 43.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 18.0, 64.0, 45.0, 18.0 ],
					"text" : "Port",
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
					"presentation_rect" : [ 172.0, 57.0, 71.39743, 18.0 ],
					"text" : "Verbose Logs",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-24",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 27.0, 318.0, 107.0, 22.0 ],
					"text" : "s ---stop-if-running"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-13",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 45.0, 257.0, 50.0, 22.0 ],
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
					"patching_rect" : [ 27.0, 215.0, 37.0, 22.0 ],
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
					"fontface" : 1,
					"fontsize" : 11.0,
					"id" : "obj-2",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 48.0, 68.0, 77.0, 20.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 7.0, 4.0, 53.846161000000002, 20.0 ],
					"text" : "Server",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"bgcolor" : [ 0.274509803921569, 0.274509803921569, 0.274509803921569, 1.0 ],
					"id" : "obj-50",
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 614.0, 537.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 150.0, 4.0, 96.0, 79.0 ],
					"proportion" : 0.39,
					"saved_attribute_attributes" : 					{
						"bgfillcolor" : 						{
							"expression" : "themecolor.live_assignment_text_bg"
						}

					}

				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"bgcolor" : [ 0.274509803921569, 0.274509803921569, 0.274509803921569, 1.0 ],
					"id" : "obj-52",
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 575.0, 505.0, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 4.0, 4.0, 136.0, 142.0 ],
					"proportion" : 0.39,
					"saved_attribute_attributes" : 					{
						"bgfillcolor" : 						{
							"expression" : "themecolor.live_assignment_text_bg"
						}

					}

				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Open the built-in AI chat UI in a web browser.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-63",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 123.666670352220535, 168.000005006790161, 128.0, 128.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 144.000004291534424, 92.666669428348541, 105.999995708465576, 48.333334773778915 ],
					"proportion" : 0.39,
					"varname" : "Open Chat UI"
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
					"destination" : [ "obj-35", 0 ],
					"source" : [ "obj-32", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-53", 0 ],
					"source" : [ "obj-34", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-53", 0 ],
					"source" : [ "obj-36", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-62", 0 ],
					"source" : [ "obj-4", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-36", 0 ],
					"order" : 2,
					"source" : [ "obj-40", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-51", 0 ],
					"order" : 1,
					"source" : [ "obj-40", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-58", 0 ],
					"order" : 3,
					"source" : [ "obj-40", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-60", 0 ],
					"order" : 0,
					"source" : [ "obj-40", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-36", 0 ],
					"order" : 2,
					"source" : [ "obj-41", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-4", 0 ],
					"order" : 3,
					"source" : [ "obj-41", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-49", 0 ],
					"order" : 1,
					"source" : [ "obj-41", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-61", 0 ],
					"order" : 0,
					"source" : [ "obj-41", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-41", 0 ],
					"source" : [ "obj-44", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-34", 0 ],
					"order" : 2,
					"source" : [ "obj-45", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-47", 0 ],
					"order" : 1,
					"source" : [ "obj-45", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-58", 0 ],
					"order" : 3,
					"source" : [ "obj-45", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-59", 0 ],
					"order" : 0,
					"source" : [ "obj-45", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-40", 0 ],
					"source" : [ "obj-46", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-54", 0 ],
					"source" : [ "obj-47", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-45", 0 ],
					"source" : [ "obj-48", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-54", 0 ],
					"source" : [ "obj-49", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-54", 0 ],
					"source" : [ "obj-51", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-43", 0 ],
					"source" : [ "obj-53", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-42", 0 ],
					"source" : [ "obj-54", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-62", 0 ],
					"source" : [ "obj-58", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-55", 0 ],
					"source" : [ "obj-59", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-55", 0 ],
					"source" : [ "obj-60", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-55", 0 ],
					"source" : [ "obj-61", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-43", 0 ],
					"source" : [ "obj-62", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-3", 0 ],
					"order" : 1,
					"source" : [ "obj-64", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-71", 0 ],
					"order" : 0,
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
					"destination" : [ "obj-35", 1 ],
					"source" : [ "obj-71", 0 ]
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
			"obj-32" : [ "live.text[3]", "live.text[3]", 0 ],
			"obj-55" : [ "live.button", "live.button", 0 ],
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
		"dependency_cache" : [  ],
		"autosave" : 0
	}

}
