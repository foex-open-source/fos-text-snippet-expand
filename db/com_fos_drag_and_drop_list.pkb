create or replace package body com_fos_drag_and_drop_list
as

-- =============================================================================
--
--  FOS = FOEX Open Source (fos.world), by FOEX GmbH, Austria (www.foex.at)
--
-- =============================================================================
--
function render
  ( p_dynamic_action in apex_plugin.t_dynamic_action
  , p_plugin         in apex_plugin.t_plugin
  )
return apex_plugin.t_dynamic_action_render_result
as
    l_result          apex_plugin.t_dynamic_action_render_result;

    l_ajax_id         varchar2(4000) := apex_plugin.get_ajax_identifier;

    --attributes
    l_mode            p_dynamic_action.attribute_01%type := p_dynamic_action.attribute_01;
    l_action          p_dynamic_action.attribute_02%type := p_dynamic_action.attribute_02;
    l_items_to_submit varchar2(4000)                     := apex_plugin_util.page_item_names_to_jquery(p_dynamic_action.attribute_04);
    l_js_fn           p_dynamic_action.attribute_02%type := p_dynamic_action.attribute_05;
    l_js_fn_name      varchar2(100)                      := 'dd'||p_dynamic_action.id;

    l_init_js_fn      varchar2(32767)                    := nvl(apex_plugin_util.replace_substitutions(p_dynamic_action.init_javascript_code), 'undefined');
begin

    --debug
    if apex_application.g_debug
    then
        apex_plugin_util.debug_dynamic_action
          ( p_plugin         => p_plugin
          , p_dynamic_action => p_dynamic_action
          );
    end if;

    -- add css files
    apex_css.add_file
      ( p_name           => apex_plugin_util.replace_substitutions('style#MIN#.css')
      , p_directory      => p_plugin.file_prefix || 'css/'
      , p_skip_extension => true
      );

    -- add needed libraries
    apex_javascript.add_library
      ( p_name      => 'draggable.bundle.min'
      , p_directory => p_plugin.file_prefix||'/js/'
      );

    apex_json.initialize_clob_output;

    apex_json.open_object;
    apex_json.write('ajaxId'       , l_ajax_id        );
    apex_json.write('mode'         , lower(l_mode)    );
    apex_json.write('action'       , l_action         );
    apex_json.write('itemsToSubmit', l_items_to_submit);
    apex_json.write('groupSelector', 'ul'             );
    apex_json.write('itemSelector' , 'li'             );
    apex_json.write('jsFn'         , l_js_fn_name     );
    apex_json.close_object;

    l_result.javascript_function := 'function(){'||
       case when l_action = 'javascript' then 'window.'||l_js_fn_name||' = '||l_js_fn||';' end ||
       'FOS.utils.enableDragDrop(this, ' || apex_json.get_clob_output|| ', '|| l_init_js_fn  || ');}';

    apex_json.free_output;

    -- all done, return l_result now containing the javascript function
    return l_result;
end render;

function ajax
  ( p_dynamic_action in apex_plugin.t_dynamic_action
  , p_plugin         in apex_plugin.t_plugin
  )
return apex_plugin.t_dynamic_action_ajax_result
as
    l_result apex_plugin.t_dynamic_action_ajax_result;

    l_statement         p_dynamic_action.attribute_03%type := p_dynamic_action.attribute_03;
    l_sql_parameters    apex_exec.t_parameters;
    l_drag_id           varchar2(2000);
    l_drop_id           varchar2(2000);
    l_before            varchar2(32000);
    l_after             varchar2(32000);
begin

    --debug
    if apex_application.g_debug
    then
        apex_plugin_util.debug_dynamic_action
          ( p_plugin         => p_plugin
          , p_dynamic_action => p_dynamic_action
          );
    end if;

    apex_debug.info('clob %s',apex_application.g_clob_01);

    apex_json.parse(apex_application.g_clob_01);

    if apex_json.does_exist ('swapped')
    then
        l_drag_id := apex_json.get_varchar2('swapped.dragId');
        l_drop_id := apex_json.get_varchar2('swapped.dropId');
    else
        l_drag_id := apex_json.get_varchar2('sorted.dragId');
        l_drop_id := apex_json.get_varchar2('sorted.dropId');
    end if;

    l_before := apex_json.get_varchar2('sequence.before');
    l_after  := apex_json.get_varchar2('sequence.after');

    -- bind only those variables which actually exist in the statement, otherwise it errors out
    if instr(upper(l_statement),':DRAG_ID')         > 0
    then
        apex_exec.add_parameter( l_sql_parameters, 'DRAG_ID'        ,  l_drag_id );
    end if;

    if instr(upper(l_statement),':DROP_ID')         > 0
    then
        apex_exec.add_parameter( l_sql_parameters, 'DROP_ID'        ,  l_drop_id );
    end if;

    if instr(upper(l_statement),':BEFORE_SEQUENCE') > 0
    then
        apex_exec.add_parameter( l_sql_parameters, 'BEFORE_SEQUENCE',  l_before );
    end if;

    if instr(upper(l_statement),':AFTER_SEQUENCE') > 0
    then
        apex_exec.add_parameter( l_sql_parameters, 'AFTER_SEQUENCE' ,  l_after );
    end if;

    ----------------------------------------------------------------------------
    -- this now runs the actual PL/SQL code
    ----------------------------------------------------------------------------
    apex_exec.execute_plsql
      ( p_plsql_code      => l_statement
      , p_auto_bind_items => true
      , p_sql_parameters  => l_sql_parameters
      );

    -- prepare a json object as response for the client
    apex_json.initialize_output;
    apex_json.open_object;

    apex_json.write('status', 'success');

    apex_json.close_object;

    return l_result;
end ajax;

end;
/


