# v8 class LiveAPI

A means of communicating with the Live API from JavaScript with the Max v8 object.

### **Example**

```
var api = new LiveAPI(sample_callback, "live_set tracks 0");
if (!api) {
    post("no api object\n");
    return;
}
post("api.mode", api.mode ? "follows path" : "follows object", "\n");
post("api.id is", api.id, "\n");
post("api.path is", api.path, "\n");
post("api.children are", api.children, "\n");
post('api.getcount("devices")', api.getcount("devices"), "\n");

api.property = "mute";
post("api.property is", api.property, "\n");
post("type of", api.property, "is", api.proptype, "\n");

function sample_callback(args) {
    post("callback called with arguments:", args, "\n");
}
```

## Constructors

```
new LiveAPI(callback?: Function, path?: string);
```

Constructs a new instance of the LiveAPI class

### Parameters

- `callback`: a function to be called when the LiveAPI object refers to a new object in Live (if the LiveAPI object's path changes, for instance) or when an observed property changes
- `path`: the object in Live pointed to by the LiveAPI object (e.g. `"live_set tracks 0 devices 0"`) or a valid LiveAPI object id

## Properties

### children

**type**: `string[]`

An array of children of the object at the current path

### id

**type**: `string`

The id of the Live object referred to by the LiveAPI object. These ids are dynamic and awarded in realtime from the Live application, so should not be stored and used over multiple runs of Max for Live.

### info

**type**: `string`
**attributes**: `read-only`

A description of the object at the current path, including id, type, children, properties and functions

### mode number

The follow mode of the LiveAPI object. 0 (default) means that LiveAPI follows the object referred to by the path, even if it is moved in the Live user interface.

For instance, consider a Live Set with two tracks, "Track 1" and "Track 2", left and right respectively. If your LiveAPI object's path is live_set tracks 0, the left-most track, it will refer to "Track 1". Should the position of "Track 1" change, such that it is now to the right of "Track 2", the LiveAPI object continues to refer to "Track 1". A mode of 1 means that LiveAPI updates the followed object based on its location in the Live user interface. In the above example, the LiveAPI object would always refer to the left-most track, updating its id when the object at that position in the user interface changes.

### patcher

**type**: `Patcher`
**attributes**: `read-only`

The patcher of the LiveAPI object, as passed into the constructor

### path

**type**: `string`

The path to the Live object referred to by the LiveAPI object.

These paths are dependent on the currently open Set in Live, but are otherwise stable: live_set tracks 0 devices 0 will always refer to the first device of the first track of the open Live Set.

### property

**type**: `string`

The observed property, child or child-list of the object at the current path, if desired  
For instance, if the LiveAPI object refers to "live_set tracks 1", setting the property to "mute" would cause changes to the "mute" property of the 2nd track to be reported to the callback function defined in the LiveAPI Constructor.

### proptype

**type**: `string`
**attributes**: `read-only`

The type of the currently observed property or child

The types of the properties and children are given in the Live Object Model.

### type

**type**: `string`
**attributes**: `read-only`

The type of the object at the current path

Please see the Live API Overview and Live Object Model documents for more information.

### unquotedpath

**type**: `string`

The path to the Live object referred to by the LiveAPI object, without any quoting (the path property contains a quoted path)  
These paths are dependent on the currently open Set in Live, but are otherwise stable: live_set tracks 0 devices 0 will always refer to the first device of the first track of the open Live Set.

## Methods

### call

Calls the given function of the current object, optionally with a list of arguments.

```
call(fn: Function, ...arguments: any[]): void;
```

#### Parameters

- `fn`: a callback function
- `arguments` arguments to the callback function

### get

Returns the value or list of values of the specified property of the current object.

```
get(property: string): number | number[];
```

#### Parameters

- `property`: the object's property

### getcount

The count of children of the object at the current path

```
getcount(child: string): number;
```

#### Parameters

- `child`: the child to count children of

### getstring

Returns the value or list of values of the specified property of the current object as a String object.

```
getstring(property: string): string | string[];
```

#### Parameters

- `property`: the object's property

### goto

Navigates to the path and causes the id of the object at that path out be sent to the callback function defined in the Constructor. If there is no object at the path, id 0 is sent.

```
goto(path: string): void;
```

#### Parameters

- `path`: the path to navigate to

### set

Sets the value or list of values of the specified property of the current object.

```
set(property: string, value: any): void;
```

#### Parameters

- `property`: the object's property to set
- `value`: the new value or values of the property
