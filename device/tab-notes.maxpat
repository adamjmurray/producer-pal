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
		"rect" : [ 226.0, 324.0, 579.0, 521.0 ],
		"openinpresentation" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"id" : "obj-44",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 372.5, 22.0, 141.0, 22.0 ],
					"text" : "r ---project-context-editor"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-11",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 376.0, 245.0, 177.0, 22.0 ],
					"text" : "prepend projectContextWritable"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-9",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 399.0, 214.5, 84.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 139.0, 3.0, 84.0, 18.0 ],
					"text" : "Allow AI Updates",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Let the AI update the project context based on your conversations to remember important details about your project.",
					"annotation_name" : "Allow AI Updates ",
					"id" : "obj-7",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 376.5, 216.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 124.0, 3.0, 15.286624431610107, 17.363057315349579 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Allow AI Updates ",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Let the AI update the project context based on your conversations to remember important details about your project.",
							"parameter_invisible" : 1,
							"parameter_longname" : "projectContextWritable",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "projectContextWritable",
							"parameter_type" : 2
						}

					}
,
					"varname" : "projectContextWritable"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-5",
					"linecount" : 3,
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 180.5, 33.5, 96.0, 41.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 1.910828053951263, 134.394906461238861, 246.0, 18.0 ],
					"text" : "Optional info to help AI understand your project goals",
					"textjustification" : 1
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-19",
					"linecount" : 2,
					"maxclass" : "comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 163.5, 105.0, 210.0, 33.0 ],
					"text" : "resync values from the UI to v8 when it restarts during development"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-17",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "outputvalue", "bang" ],
					"patching_rect" : [ 180.5, 178.0, 87.0, 22.0 ],
					"text" : "t outputvalue b"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-16",
					"maxclass" : "newobj",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 180.5, 140.0, 81.0, 22.0 ],
					"text" : "r ---v8-started"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-12",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 180.0, 245.0, 177.0, 22.0 ],
					"text" : "prepend projectContextEnabled"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-10",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 24.0, 245.0, 133.0, 22.0 ],
					"text" : "prepend projectContext"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-8",
					"maxclass" : "newobj",
					"numinlets" : 2,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 24.0, 96.0, 84.0, 22.0 ],
					"text" : "routepass text"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-6",
					"maxclass" : "newobj",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 115.0, 360.0, 42.0, 22.0 ],
					"text" : "s ---v8"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Share the project context text with the AI to help it understand your project goals.",
					"annotation_name" : "Enable Project Context",
					"id" : "obj-4",
					"maxclass" : "live.toggle",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"parameter_enable" : 1,
					"patching_rect" : [ 181.0, 216.0, 15.0, 15.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 1.0, 2.0, 15.286624, 17.363057000000001 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Enable Project Context",
							"parameter_enum" : [ "off", "on" ],
							"parameter_info" : "Share the project context text with the AI to help it understand your project goals.",
							"parameter_invisible" : 1,
							"parameter_longname" : "projectContextEnabled",
							"parameter_mmax" : 1,
							"parameter_modmode" : 0,
							"parameter_shortname" : "projectContextEnabled",
							"parameter_type" : 2
						}

					}
,
					"varname" : "projectContextEnabled"
				}

			}
, 			{
				"box" : 				{
					"annotation" : "Optional info to help AI understand your project goals",
					"annotation_name" : "Project Context",
					"id" : "obj-2",
					"maxclass" : "textedit",
					"numinlets" : 1,
					"numoutlets" : 4,
					"outlettype" : [ "", "int", "", "" ],
					"outputmode" : 1,
					"parameter_enable" : 1,
					"parameter_mappable" : 0,
					"patching_rect" : [ 24.0, 29.0, 146.0, 50.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, 20.0, 249.704148411750793, 117.869826018810272 ],
					"saved_attribute_attributes" : 					{
						"valueof" : 						{
							"parameter_annotation_name" : "Project Context",
							"parameter_info" : "Optional info to help AI understand your project goals",
							"parameter_invisible" : 1,
							"parameter_longname" : "projectContext",
							"parameter_modmode" : 0,
							"parameter_shortname" : "projectContext",
							"parameter_type" : 3
						}

					}
,
					"varname" : "projectContext"
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-3",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 207.0, 214.5, 84.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 15.0, 2.0, 84.0, 18.0 ],
					"text" : "Project Context",
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
					"patching_rect" : [ 304.5, 36.5, 45.0, 35.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, 0.0, 250.0, 150.0 ],
					"proportion" : 0.39,
					"rounded" : 0
				}

			}
, 			{
				"box" : 				{
					"id" : "obj-13",
					"maxclass" : "message",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 372.5, 54.0, 50.0, 22.0 ],
					"text" : "set $1"
				}

			}
 ],
		"lines" : [ 			{
				"patchline" : 				{
					"destination" : [ "obj-6", 0 ],
					"source" : [ "obj-10", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-6", 0 ],
					"source" : [ "obj-11", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-6", 0 ],
					"source" : [ "obj-12", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-2", 0 ],
					"source" : [ "obj-13", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-17", 0 ],
					"source" : [ "obj-16", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-2", 0 ],
					"source" : [ "obj-17", 1 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-4", 0 ],
					"order" : 1,
					"source" : [ "obj-17", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-7", 0 ],
					"order" : 0,
					"source" : [ "obj-17", 0 ]
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
					"destination" : [ "obj-12", 0 ],
					"source" : [ "obj-4", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-13", 0 ],
					"source" : [ "obj-44", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-11", 0 ],
					"source" : [ "obj-7", 0 ]
				}

			}
, 			{
				"patchline" : 				{
					"destination" : [ "obj-10", 0 ],
					"source" : [ "obj-8", 0 ]
				}

			}
 ],
		"parameters" : 		{
			"obj-2" : [ "projectContext", "projectContext", 0 ],
			"obj-4" : [ "projectContextEnabled", "projectContextEnabled", 0 ],
			"obj-7" : [ "projectContextWritable", "projectContextWritable", 0 ],
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
