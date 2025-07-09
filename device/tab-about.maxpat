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
		"rect" : [ 71.0, 460.0, 351.0, 509.0 ],
		"openinpresentation" : 1,
		"gridsize" : [ 15.0, 15.0 ],
		"boxes" : [ 			{
				"box" : 				{
					"id" : "obj-3",
					"maxclass" : "live.comment",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 64.0, 63.0, 150.0, 18.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 90.0, 57.0, 45.0, 18.0 ],
					"text" : "About",
					"textjustification" : 0
				}

			}
, 			{
				"box" : 				{
					"autofit" : 1,
					"forceaspect" : 1,
					"id" : "obj-2",
					"maxclass" : "fpic",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "jit_matrix" ],
					"patching_rect" : [ 174.0, 104.0, 51.0, 51.0 ],
					"pic" : "/Users/adammurray/workspace/producer-pal/device/icon.png",
					"presentation" : 1,
					"presentation_rect" : [ 189.0, 89.0, 51.0, 51.0 ]
				}

			}
, 			{
				"box" : 				{
					"background" : 1,
					"id" : "obj-1",
					"maxclass" : "panel",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 0.0, 0.0, 250.0, 150.0 ],
					"presentation" : 1,
					"presentation_rect" : [ 0.0, 0.0, 250.0, 150.0 ],
					"rounded" : 0
				}

			}
 ],
		"lines" : [  ],
		"dependency_cache" : [ 			{
				"name" : "icon.png",
				"bootpath" : "~/workspace/producer-pal/device",
				"patcherrelativepath" : ".",
				"type" : "PNG",
				"implicit" : 1
			}
 ],
		"autosave" : 0
	}

}
