package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Locale;

/**
 * Reads the configured field defaults and falls back to the verified values for anything missing.
 * A configuration saved before a new key existed must keep working instead of failing at send time.
 */
final class JiraFieldDefaults {
 private final JsonNode configured; private final JsonNode builtIn;
 JiraFieldDefaults(ObjectMapper mapper,String json){
  this.builtIn=read(mapper,JiraConfigStore.DEFAULT_FIELDS);
  var parsed=read(mapper,json);
  this.configured=parsed.isMissingNode()?this.builtIn:parsed;
 }
 private static JsonNode read(ObjectMapper mapper,String json){
  try{return json==null||json.isBlank()?mapper.missingNode():mapper.readTree(json);}
  catch(Exception invalid){return mapper.missingNode();}
 }
 String text(String field,String fallback){
  var value=configured.path(field);
  if(value.isTextual()&&!value.asText().isBlank())return value.asText();
  var fromBuiltIn=builtIn.path(field);
  return fromBuiltIn.isTextual()&&!fromBuiltIn.asText().isBlank()?fromBuiltIn.asText():fallback;
 }
 String option(String group,String key,String fallback){
  String normalised=key==null||key.isBlank()?"UNSET":key.toUpperCase(Locale.ROOT);
  var value=configured.path(group).path(normalised);
  if(value.isTextual()&&!value.asText().isBlank())return value.asText();
  var fromBuiltIn=builtIn.path(group).path(normalised);
  return fromBuiltIn.isTextual()&&!fromBuiltIn.asText().isBlank()?fromBuiltIn.asText():fallback;
 }
 int number(String group,String key,int fallback){
  var value=configured.path(group).path(key);
  if(value.isNumber())return value.asInt();
  var fromBuiltIn=builtIn.path(group).path(key);
  return fromBuiltIn.isNumber()?fromBuiltIn.asInt():fallback;
 }
 /**
  * Raw field block copied straight into the issue payload. Jira projects can make fields mandatory
  * through behaviours that createmeta never reports, so new ones must be addable without a release.
  */
 ObjectNode block(String group){
  var value=configured.path(group);
  if(!value.isObject())value=builtIn.path(group);
  return value.isObject()?((ObjectNode)value).deepCopy():null;
 }
}
