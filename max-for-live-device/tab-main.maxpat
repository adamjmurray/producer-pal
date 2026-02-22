{
	"patcher" : 	{
		"fileversion" : 1,
		"appversion" : 		{
			"major" : 9,
			"minor" : 0,
			"revision" : 10,
			"architecture" : "x64",
			"modernui" : 1
		}
,
		"classnamespace" : "box",
		"rect" : [ 827.0, 206.0, 505.0, 487.0 ],
		"openinpresentation" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"fontface" : 1,
					"fontname" : "Ableton Sans Bold",
					"fontsize" : 9.0,
					"id" : "obj-10",
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 46.0, 52.0, 86.0, 17.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 172.0, 16.0, 24.0, 17.0 ],
					"text" : "TM",
					"textjustification" : 1
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-6",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "outputvalue" ],
					"patching_rect" : [ 370.0, 199.0, 77.0, 22.0 ],
					"text" : "t outputvalue"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-44",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 370.0, 162.0, 95.0, 22.0 ],
					"text" : "r ---node-started"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Open the built-in AI chat UI in a web browser.",
					"annotation_name" : "Open Chat UI",
					"fontsize" : 10.0,
					"id" : "obj-32",
					"maxclass" : "live.text",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 52.0, 365.5, 83.0, 24.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 85.0, 125.0, 80.0, 20.0 ],
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
					"annotation" : "Enable the built-in chat UI. Disabling the chat UI makes it inaccessible over the local network.",
					"annotation_name" : "Enable Chat UI",
					"id" : "obj-37",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 370.0, 242.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 77.0, 103.0, 15.0, 15.0 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Enable Chat UI",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Enable the built-in chat UI. Disabling the chat UI makes it inaccessible over the local network.",
							"parameter_initial" : [ 1 ],
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
					"varname" : "disable-chat-ui"
				}

			}
, 			{
				"box" : 				{
					"angle" : 270.0,
					"annotation" : "Enable the built-in chat UI. Disabling the chat UI makes it inaccessible over the local network.",
					"bgcolor" : [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
					"hint" : "",
					"id" : "obj-72",
					"ignoreclick" : 0,
					"maxclass" : "panel",
					"mode" : 0,
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 808.0, 82.0, 63.0, 83.5 ],
					"presentation" : 1,
					"presentation_rect" : [ 70.000002086162567, 92.00000274181366, 113.5, 28.0 ],
					"proportion" : 0.39,
					"varname" : "Enable Chat UI"
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
					"presentation_rect" : [ 70.000002086162567, 119.499999538064003, 113.666670054197311, 28.50000487267971 ],
					"proportion" : 0.39,
					"varname" : "Open Chat UI"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-5",
					"linecount" : 2,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 188.0, 202.0, 150.0, 29.0 ],
					"presentation" : 1,
					"presentation_linecount" : 2,
					"presentation_rect" : [ 181.0, 118.0, 69.0, 29.0 ],
					"text" : "© 2026 \nAdam Murray",
					"textjustification" : 1
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-75",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 370.0, 281.0, 104.0, 22.0 ],
					"text" : "chatUIEnabled $1"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-65",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 387.0, 242.0, 87.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 93.0, 102.0, 79.397429999999986, 18.0 ],
					"text" : "Enable Chat UI",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-9",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 370.0, 322.0, 89.0, 22.0 ],
					"text" : "s ---node-script"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-13",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 175.0, 323.0, 48.0, 22.0 ],
					"text" : "r ---port"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-71",
					"linecount" : 2,
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 175.0, 360.0, 171.0, 35.0 ],
					"text" : "sprintf \\; max launch_browser http://localhost:%d/chat"
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
					"patching_rect" : [ 52.0, 411.0, 142.0, 49.0 ],
					"text" : ";\rmax launch_browser http://localhost:3350/chat"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-8",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 267.0, 123.0, 72.0, 22.0 ],
					"text" : "prepend set"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-2",
					"linecount" : 2,
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 267.0, 75.0, 102.0, 35.0 ],
					"text" : "combine v X.Y.Z @triggers 1"
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
					"patching_rect" : [ 24.0, 91.0, 198.0, 71.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 28.0, 15.0, 213.0, 75.0 ],
					"viewvisibility" : 1
				}

			}
, 			{
				"box" : 				{
					"autofit" : 1,
					"forceaspect" : 1,
					"id" : "obj-54",
					"maxclass" : "fpic",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "jit_matrix" ],
					"patching_rect" : [ 2.0, 14.0, 65.0, 45.5 ],
					"pic" : "producer-pal-logo.svg",
					"presentation" : 1,
					"presentation_rect" : [ 13.0, 6.0, 49.999999344348907, 34.999999541044232 ]
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-19",
					"linecount" : 2,
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 46.0, 239.0, 240.0, 35.0 ],
					"text" : ";\rmax launchbrowser https://producer-pal.org"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Open the Producer Pal documentation website",
					"id" : "obj-18",
					"maxclass" : "textbutton",
					"numinlets" : 1,
					"numoutlets" : 3,
					"outlettype" : [ "", "", "int" ],
					"parameter_enable" : 0,
					"patching_rect" : [ 46.0, 200.0, 63.0, 21.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, 125.0, 65.0, 20.0 ],
					"text" : "📚  Docs",
					"varname" : "Producer Pal Documentation"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-7",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 302.0, 38.0, 67.0, 22.0 ],
					"text" : "r ---version"
				}

			}
, 			{
				"box" : 				{
					"fontname" : "Ableton Sans Medium",
					"id" : "obj-23",
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 267.0, 154.0, 78.0, 21.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 183.0, 28.0, 54.0, 21.0 ],
					"text" : "vX.Y.Z",
					"textjustification" : 1
				}

			}
, 			{
				"box" : 				{
					"fontface" : 1,
					"fontname" : "Ableton Sans Bold",
					"fontsize" : 24.0,
					"id" : "obj-3",
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 31.0, 37.0, 163.0, 35.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 25.0, 17.0, 177.0, 35.0 ],
					"text" : "roducer Pal",
					"textjustification" : 1
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
					"patching_rect" : [ 204.0, 40.0, 34.0, 29.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, -2.0, 250.0, 150.0 ],
					"proportion" : 0.39,
					"rounded" : 0
				}

			}
 ],
		"lines" : [ 			{
				"patchline" : 				{
					"destination" : [ "obj-71", 0 ],
					"source" : [ "obj-13", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-19", 0 ],
					"source" : [ "obj-18", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-8", 0 ],
					"source" : [ "obj-2", 0 ]
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
					"destination" : [ "obj-75", 0 ],
					"source" : [ "obj-37", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-6", 0 ],
					"source" : [ "obj-44", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-37", 0 ],
					"source" : [ "obj-6", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-2", 1 ],
					"source" : [ "obj-7", 0 ]
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
					"destination" : [ "obj-9", 0 ],
					"source" : [ "obj-75", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-23", 0 ],
					"source" : [ "obj-8", 0 ]
				}

			}
 ],
		"parameters" : 		{
			"obj-32" : [ "live.text[3]", "live.text[3]", 0 ],
			"obj-37" : [ "live.toggle", "live.toggle", 0 ],
			"inherited_shortname" : 1
		}
,
		"dependency_cache" : [ 			{
				"name" : "producer-pal-logo.svg",
				"bootpath" : "~/workspace/producer-pal/max-for-live-device",
				"patcherrelativepath" : ".",
				"type" : "svg",
				"implicit" : 1
			}
, 			{
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
